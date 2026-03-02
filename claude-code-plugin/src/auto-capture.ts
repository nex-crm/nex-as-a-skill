#!/usr/bin/env node
/**
 * Claude Code Stop hook — auto-capture conversation to Nex.
 *
 * Reads the transcript JSONL file, extracts the last user+assistant exchange,
 * filters and sends to Nex for ingestion.
 *
 * On ANY error: outputs {} and exits 0 (graceful degradation).
 */

import { readFile } from "node:fs/promises";
import { loadConfig } from "./config.js";
import { NexClient } from "./nex-client.js";
import { captureFilter } from "./capture-filter.js";
import { RateLimiter } from "./rate-limiter.js";

const rateLimiter = new RateLimiter();

interface HookInput {
  stop_hook_active?: boolean;
  transcript_path?: string;
  session_id?: string;
}

interface TranscriptMessage {
  role?: string;
  type?: string;
  message?: {
    role?: string;
    content?: string | Array<{ type: string; text?: string }>;
  };
  content?: string | Array<{ type: string; text?: string }>;
}

/**
 * Extract text content from a transcript message.
 */
function extractText(msg: TranscriptMessage): string {
  // Try message.content first (nested format)
  const content = msg.message?.content ?? msg.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text!)
      .join("\n");
  }
  return "";
}

/**
 * Get the role from a transcript message (handles nested format).
 */
function getRole(msg: TranscriptMessage): string | undefined {
  return msg.role ?? msg.message?.role ?? msg.type;
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
      process.stdout.write("{}");
      return;
    }

    const transcriptPath = input.transcript_path;
    if (!transcriptPath) {
      // No transcript path — can't capture
      process.stdout.write("{}");
      return;
    }

    let cfg;
    try {
      cfg = loadConfig();
    } catch {
      process.stdout.write("{}");
      return;
    }

    // Read the transcript JSONL file
    let transcriptRaw: string;
    try {
      transcriptRaw = await readFile(transcriptPath, "utf-8");
    } catch {
      // Can't read transcript — skip
      process.stdout.write("{}");
      return;
    }

    const lines = transcriptRaw.trim().split("\n").filter(Boolean);
    if (lines.length === 0) {
      process.stdout.write("{}");
      return;
    }

    // Parse messages from JSONL — get last few lines
    const recentLines = lines.slice(-20);
    const messages: TranscriptMessage[] = [];
    for (const line of recentLines) {
      try {
        messages.push(JSON.parse(line) as TranscriptMessage);
      } catch {
        // Skip unparseable lines
      }
    }

    // Extract last user + last assistant message
    const parts: string[] = [];
    const reversed = [...messages].reverse();

    const lastAssistant = reversed.find((m) => {
      const role = getRole(m);
      return role === "assistant";
    });
    const lastUser = reversed.find((m) => {
      const role = getRole(m);
      return role === "user" || role === "human";
    });

    if (lastUser) {
      const text = extractText(lastUser);
      if (text) parts.push(`User: ${text}`);
    }
    if (lastAssistant) {
      const text = extractText(lastAssistant);
      if (text) parts.push(`Assistant: ${text}`);
    }

    if (parts.length === 0) {
      process.stdout.write("{}");
      return;
    }

    const captureText = parts.join("\n\n");
    const filterResult = captureFilter(captureText);

    if (filterResult.skipped) {
      process.stdout.write("{}");
      return;
    }

    // Fire-and-forget via rate limiter
    const client = new NexClient(cfg.apiKey, cfg.baseUrl);
    rateLimiter
      .enqueue(async () => {
        await client.ingest(filterResult.text, "claude-code-conversation");
      })
      .catch(() => {
        // Silently drop — rate limited or queue full
      });

    process.stdout.write("{}");
  } catch {
    process.stdout.write("{}");
  }
}

main().then(() => process.exit(0)).catch(() => process.exit(0));
