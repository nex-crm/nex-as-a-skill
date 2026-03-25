#!/usr/bin/env node
/**
 * Claude Code UserPromptSubmit hook — auto-recall from Nex.
 *
 * Reads the user's prompt from stdin, runs it through the recall filter
 * to decide if recall is needed, queries Nex for relevant context,
 * and outputs { additionalContext: "..." } to inject into the conversation.
 *
 * On ANY error: outputs {} and exits 0 (graceful degradation).
 */

import { loadConfig, isHookEnabled } from "./config.js";
import { NexClient } from "./nex-client.js";
import { formatNexContext } from "./context-format.js";
import { RecallCache, hashPrompt } from "./recall-cache.js";
import { SessionStore } from "./session-store.js";
import { shouldRecall } from "./recall-filter.js";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sessions = new SessionStore();
const recallCache = new RecallCache();

const FAST_RECALL_BUDGET_MS = readTimeoutEnv("NEX_RECALL_SYNC_BUDGET_MS", 8_000);
const BACKGROUND_RECALL_TIMEOUT_MS = readTimeoutEnv(
  "NEX_RECALL_BACKGROUND_TIMEOUT_MS",
  60_000,
);
const READY_CACHE_TTL_MS = readTimeoutEnv("NEX_RECALL_READY_TTL_MS", 5 * 60_000);
const PENDING_CACHE_TTL_MS = readTimeoutEnv(
  "NEX_RECALL_PENDING_TTL_MS",
  BACKGROUND_RECALL_TIMEOUT_MS + 30_000,
);
const WORKER_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "auto-recall-worker.js",
);

interface HookInput {
  prompt?: string;
  session_id?: string;
}

function readTimeoutEnv(name: string, fallbackMs: number): number {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

function writeHookContext(context: string): void {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: context,
    },
  }));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function launchBackgroundRecall(
  prompt: string,
  sessionKey: string,
  promptHash: string,
): void {
  try {
    const child = spawn(process.execPath, [WORKER_PATH], {
      detached: true,
      env: {
        ...process.env,
        NEX_RECALL_BACKGROUND_TIMEOUT_MS: String(BACKGROUND_RECALL_TIMEOUT_MS),
        NEX_RECALL_PENDING_TTL_MS: String(PENDING_CACHE_TTL_MS),
      },
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.stdin.end(JSON.stringify({
      prompt,
      prompt_hash: promptHash,
      session_id: sessionKey,
    }));
    child.unref();
  } catch {
    recallCache.clearPending(sessionKey, promptHash);
  }
}

/**
 * Check if this is the first prompt for this session.
 * A session with no stored Nex session ID is considered "first prompt"
 * (SessionStart may have already set one, but that's fine — it means
 * baseline context was loaded, and first user prompt still gets recall).
 */
function isFirstPrompt(sessionKey: string | undefined): boolean {
  if (!sessionKey) return true;
  return !sessions.get(sessionKey);
}

async function main(): Promise<void> {
  try {
    // Read stdin
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    const raw = Buffer.concat(chunks).toString("utf-8");

    let input: HookInput;
    try {
      input = JSON.parse(raw) as HookInput;
    } catch {
      process.stderr.write("[nex-recall] Failed to parse stdin JSON\n");
      process.stdout.write("{}");
      return;
    }

    // Check .nex.toml kill switch
    if (!isHookEnabled("recall")) {
      process.stdout.write("{}");
      return;
    }

    const prompt = input.prompt?.trim();
    if (!prompt || prompt.length < 5) {
      process.stdout.write("{}");
      return;
    }

    // Skip slash commands
    if (prompt.startsWith("/")) {
      process.stdout.write("{}");
      return;
    }

    // --- Recall filter: decide if this prompt needs memory recall ---
    const decision = shouldRecall(prompt, isFirstPrompt(input.session_id));
    if (!decision.shouldRecall) {
      process.stdout.write("{}");
      return;
    }

    let cfg;
    try {
      cfg = loadConfig();
    } catch (err) {
      process.stderr.write(
        `[nex-recall] Config error: ${err instanceof Error ? err.message : String(err)}\n`
      );
      process.stdout.write("{}");
      return;
    }

    const client = new NexClient(cfg.apiKey, cfg.baseUrl);

    // Resolve session ID for multi-turn continuity
    const sessionKey = input.session_id;
    const promptHash = hashPrompt(prompt);
    const nexSessionId = sessionKey ? sessions.get(sessionKey) : undefined;
    const cachedReady = sessionKey
      ? recallCache.getInjectable(sessionKey, READY_CACHE_TTL_MS)
      : undefined;

    if (sessionKey && cachedReady?.promptHash === promptHash) {
      recallCache.markReadyDelivered(sessionKey);
      writeHookContext(cachedReady.context);
      return;
    }

    const hasPendingCurrent = sessionKey
      ? recallCache.hasPending(sessionKey, promptHash, PENDING_CACHE_TTL_MS)
      : false;
    let shouldStartBackground = false;

    if (!hasPendingCurrent) {
      try {
        const result = await client.ask(prompt, nexSessionId, FAST_RECALL_BUDGET_MS);

        if (result.answer) {
          if (result.session_id && sessionKey) {
            sessions.set(sessionKey, result.session_id);
          }

          const context = formatNexContext({
            answer: result.answer,
            entityCount: result.entity_references?.length ?? 0,
            sessionId: result.session_id,
          });

          if (sessionKey) {
            recallCache.setReady(sessionKey, { promptHash, context });
            recallCache.markReadyDelivered(sessionKey);
          }

          writeHookContext(context);
          return;
        }
      } catch (err) {
        if (isAbortError(err)) {
          shouldStartBackground = true;
        } else {
          process.stderr.write(
            `[nex-recall] Fast-path error: ${err instanceof Error ? err.message : String(err)}\n`
          );
        }
      }
    }

    if (sessionKey && shouldStartBackground && !hasPendingCurrent) {
      recallCache.setPending(sessionKey, promptHash);
      launchBackgroundRecall(prompt, sessionKey, promptHash);
    }

    if (sessionKey && cachedReady) {
      recallCache.markReadyDelivered(sessionKey);
      writeHookContext(cachedReady.context);
      return;
    }

    process.stdout.write("{}");
  } catch (err) {
    process.stderr.write(
      `[nex-recall] Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.stdout.write("{}");
  }
}

main().then(() => process.exit(0)).catch(() => process.exit(0));
