/**
 * Claude Code provider for the Pi-style agent loop.
 *
 * Spawns `claude -p` as a subprocess with stream-json output,
 * following the Paperclip adapter pattern:
 * - Session persistence via --resume for context across ticks
 * - --allowedTools for pre-approved tool access
 * - --cwd for working directory scoping
 * - Defensive NDJSON parsing of streamed events
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { AgentTool, StreamFn } from "../types.js";

/** Tracks session state across ticks for a given agent. */
const sessionStore = new Map<string, string>(); // agentSlug → sessionId

/**
 * Create a StreamFn that runs Claude Code on the user's machine.
 *
 * @param agentSlug  Agent identifier for session persistence
 * @param cwd        Working directory for Claude Code (default: process.cwd())
 * @param model      Model override (default: let Claude Code pick)
 */
export function createClaudeCodeStreamFn(
  agentSlug = "default",
  cwd?: string,
  model?: string,
): StreamFn {
  return async function* claudeCodeStream(
    messages: Array<{ role: string; content: string }>,
    tools: AgentTool[],
  ) {
    const lastMsg = messages[messages.length - 1];
    const prompt = lastMsg?.content ?? "";

    // Build context from earlier messages (keep it concise for the prompt)
    const context = messages.slice(0, -1)
      .map(m => `${m.role}: ${m.content}`)
      .join("\n")
      .slice(-4000);

    const fullPrompt = context
      ? `Context:\n${context}\n\nUser: ${prompt}`
      : prompt;

    // Build CLI arguments following Paperclip's pattern
    const args: string[] = [
      "-p", fullPrompt,
      "--output-format", "stream-json",
      "--verbose",
      "--max-turns", "5",
    ];

    // Session resume for context continuity across ticks
    const existingSession = sessionStore.get(agentSlug);
    if (existingSession) {
      args.push("--resume", existingSession);
    }

    // Working directory
    if (cwd) {
      args.push("--cwd", cwd);
    }

    // Model override
    if (model) {
      args.push("--model", model);
    }

    // Pre-approve common tools to avoid permission prompts
    args.push(
      "--allowedTools",
      "Read,Glob,Grep,WebSearch,WebFetch",
    );

    // Spawn claude CLI
    const proc: ChildProcess = spawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
      cwd: cwd ?? process.cwd(),
    });

    let buffer = "";
    const textChunks: string[] = [];
    let newSessionId: string | undefined;

    try {
      if (!proc.stdout) {
        yield { type: "text" as const, content: "Error: Claude Code process has no stdout" };
        return;
      }

      for await (const chunk of proc.stdout) {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line);
          } catch {
            continue; // skip non-JSON lines
          }

          // Capture session ID from init event
          if (event.type === "system" && event.subtype === "init") {
            const sid = event.session_id as string | undefined;
            if (sid) {
              newSessionId = sid;
            }
          }

          // Also capture from any event that has session_id
          if (!newSessionId && event.session_id) {
            newSessionId = event.session_id as string;
          }

          // Assistant message with text content
          if (event.type === "assistant" && event.message) {
            const msg = event.message as Record<string, unknown>;
            const content = msg.content as Array<Record<string, unknown>> | undefined;
            if (content) {
              for (const part of content) {
                if (part.type === "text" && part.text) {
                  textChunks.push(part.text as string);
                }
                // Claude Code tool uses are handled internally by Claude Code,
                // but we can observe them for logging
                if (part.type === "tool_use") {
                  // Tool calls are executed by Claude Code itself, not our loop.
                  // We just observe and could emit events for the UI.
                }
              }
            }
          }

          // Final result — use as fallback if no text chunks collected
          if (event.type === "result") {
            const resultText = event.result as string | undefined;
            if (resultText && textChunks.length === 0) {
              textChunks.push(resultText);
            }
          }
        }
      }

      // Yield accumulated text as a single message
      if (textChunks.length > 0) {
        yield { type: "text" as const, content: textChunks.join("") };
      }

      // Persist session ID for next tick
      if (newSessionId) {
        sessionStore.set(agentSlug, newSessionId);
      }
    } catch (err) {
      yield {
        type: "text" as const,
        content: `Claude Code error: ${err instanceof Error ? err.message : String(err)}`,
      };
    } finally {
      if (!proc.killed) {
        proc.kill("SIGTERM");
      }
    }

    // Wait for process to exit (with timeout)
    await new Promise<void>((resolve) => {
      proc.on("close", () => resolve());
      setTimeout(resolve, 5000);
    });
  };
}

/** Clear stored session for an agent (e.g., on agent reset). */
export function clearClaudeSession(agentSlug: string): void {
  sessionStore.delete(agentSlug);
}
