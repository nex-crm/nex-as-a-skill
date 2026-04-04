#!/usr/bin/env node

import { loadConfig } from "./config.js";
import { formatNexContext } from "./context-format.js";
import { NexClient } from "./nex-client.js";
import { RecallCache } from "./recall-cache.js";

const recallCache = new RecallCache();

interface WorkerInput {
  prompt?: string;
  prompt_hash?: string;
  session_id?: string;
}

function readTimeoutEnv(name: string, fallbackMs: number): number {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

const BACKGROUND_RECALL_TIMEOUT_MS = readTimeoutEnv(
  "NEX_RECALL_BACKGROUND_TIMEOUT_MS",
  60_000,
);
const PENDING_CACHE_TTL_MS = readTimeoutEnv(
  "NEX_RECALL_PENDING_TTL_MS",
  BACKGROUND_RECALL_TIMEOUT_MS + 30_000,
);

async function readInput(): Promise<WorkerInput> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8")) as WorkerInput;
  } catch {
    return {};
  }
}

async function main(): Promise<void> {
  let input: WorkerInput = {};
  try {
    input = await readInput();
    const prompt = input.prompt?.trim();
    const promptHash = input.prompt_hash?.trim();
    const sessionKey = input.session_id?.trim();

    if (!prompt || !promptHash || !sessionKey) {
      return;
    }

    if (!recallCache.hasPending(sessionKey, promptHash, PENDING_CACHE_TTL_MS)) {
      return;
    }

    const cfg = loadConfig();
    const client = new NexClient(cfg.apiKey, cfg.baseUrl);
    const result = await client.prepareAgentTurnContext(prompt, sessionKey, BACKGROUND_RECALL_TIMEOUT_MS);

    if (!result.prepared_context) {
      recallCache.clearPending(sessionKey, promptHash);
      return;
    }

    const context = formatNexContext({
      answer: result.prepared_context,
      entityCount: result.entity_references?.length ?? 0,
    });

    if (!recallCache.hasPending(sessionKey, promptHash, PENDING_CACHE_TTL_MS)) {
      return;
    }

    recallCache.setReady(sessionKey, {
      promptHash,
      context,
    });
  } catch {
    const promptHash = input.prompt_hash?.trim();
    const sessionKey = input.session_id?.trim();
    if (promptHash && sessionKey) {
      recallCache.clearPending(sessionKey, promptHash);
    }
  }
}

main().then(() => process.exit(0)).catch(() => process.exit(0));
