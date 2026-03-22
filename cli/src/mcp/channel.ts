/**
 * Nex Channel — pushes daily digests and proactive notifications
 * into active Claude Code sessions via the Channels API.
 *
 * Uses the existing Nex API client to query context and insights,
 * then forwards results as channel notifications.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { NexApiClient } from "./client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChannelState {
  lastDigestAt: number;        // epoch ms — last daily digest push
  lastNotifyCheckAt: number;   // epoch ms — last proactive notification poll
}

/**
 * Minimal interface for the underlying MCP Server's notification method.
 * We use this instead of importing the full Server type to avoid coupling
 * to the SDK's internal type hierarchy.
 */
interface NotificationSender {
  notification(notification: {
    method: string;
    params?: Record<string, unknown>;
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATE_DIR = join(homedir(), ".nex");
const STATE_PATH = join(STATE_DIR, "channel-state.json");

/** How often to check whether a daily digest is due (1 hour). */
const DIGEST_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Minimum gap between daily digests (24 hours). */
const DIGEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** How often to poll for proactive notifications. Configurable via NEX_NOTIFY_INTERVAL_MINUTES env (default: 15). */
const NOTIFY_INTERVAL_MS = Math.max(1, parseInt(process.env.NEX_NOTIFY_INTERVAL_MINUTES ?? "15", 10)) * 60 * 1000;

/** Delay before the first digest check after startup (10 seconds). */
const INITIAL_DIGEST_DELAY_MS = 10_000;

/** Delay before the first notification check after startup (15 seconds). */
const INITIAL_NOTIFY_DELAY_MS = 15_000;

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

function loadState(): ChannelState {
  try {
    if (existsSync(STATE_PATH)) {
      return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
    }
  } catch {
    // Corrupted or unreadable — start fresh
  }
  return { lastDigestAt: 0, lastNotifyCheckAt: 0 };
}

function saveState(state: ChannelState): void {
  try {
    if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state));
  } catch {
    // Best-effort — don't crash if write fails
  }
}

// ---------------------------------------------------------------------------
// Push helper
// ---------------------------------------------------------------------------

async function pushChannelEvent(
  server: NotificationSender,
  content: string,
  meta: Record<string, string> = {},
): Promise<void> {
  await server.notification({
    method: "notifications/claude/channel",
    params: { content, meta },
  });
}

// ---------------------------------------------------------------------------
// Digest logic
// ---------------------------------------------------------------------------

async function checkDigest(
  server: NotificationSender,
  client: NexApiClient,
  state: ChannelState,
): Promise<void> {
  const now = Date.now();
  if (now - state.lastDigestAt < DIGEST_COOLDOWN_MS) return;

  try {
    const result = (await client.post("/v1/context/ask", {
      query:
        "Provide a comprehensive daily digest: summarize all key context " +
        "collected in the last 24 hours, including important updates, new " +
        "relationships, deal changes, upcoming events, and any actionable " +
        "items. Be specific with names, dates, and numbers.",
    })) as { answer?: string };

    if (result.answer && result.answer.trim().length > 0) {
      await pushChannelEvent(server, result.answer, {
        type: "daily_digest",
        period: "24h",
      });
      state.lastDigestAt = now;
      saveState(state);
    }
  } catch (err) {
    console.error("[nex-channel] digest check failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Proactive notification logic
// ---------------------------------------------------------------------------

async function checkNotifications(
  server: NotificationSender,
  client: NexApiClient,
  state: ChannelState,
): Promise<void> {
  const now = Date.now();

  try {
    const lastCheck = state.lastNotifyCheckAt || now - NOTIFY_INTERVAL_MS;
    const notifyIntervalMinutes = NOTIFY_INTERVAL_MS / 60_000;
    const minutesSinceLastCheck = Math.max(
      notifyIntervalMinutes,
      Math.ceil((now - lastCheck) / 60_000),
    );

    const result = (await client.get(
      `/v1/insights?last=${minutesSinceLastCheck}m&limit=10`,
    )) as {
      insights?: Array<{
        content?: string;
        type?: string;
        importance?: string;
      }>;
    };

    state.lastNotifyCheckAt = now;
    saveState(state);

    if (result.insights && result.insights.length > 0) {
      const summary = result.insights
        .map(
          (i) =>
            `- [${i.type || "update"}${i.importance ? ` | ${i.importance}` : ""}] ${i.content || JSON.stringify(i)}`,
        )
        .join("\n");

      await pushChannelEvent(server, summary, {
        type: "proactive_notification",
        count: String(result.insights.length),
      });
    }
  } catch (err) {
    console.error("[nex-channel] notification check failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Start the Nex notification channel. Call this after the MCP server
 * has connected to its transport.
 *
 * @param server  The underlying MCP `Server` instance (mcpServer.server)
 * @param client  An authenticated NexApiClient
 */
export function startChannel(
  server: NotificationSender,
  client: NexApiClient,
): void {
  if (!client.isAuthenticated) return;

  const state = loadState();

  // --- Daily digest ---
  // Initial check after a short delay to let the session settle
  setTimeout(() => checkDigest(server, client, state), INITIAL_DIGEST_DELAY_MS);
  // Then check hourly (only fires digest if 24h have passed)
  setInterval(
    () => checkDigest(server, client, state),
    DIGEST_CHECK_INTERVAL_MS,
  );

  // --- Proactive notifications ---
  setTimeout(
    () => checkNotifications(server, client, state),
    INITIAL_NOTIFY_DELAY_MS,
  );
  setInterval(
    () => checkNotifications(server, client, state),
    NOTIFY_INTERVAL_MS,
  );

  console.error(`[nex-channel] started (digest: 24h, notifications: ${NOTIFY_INTERVAL_MS / 60_000}m)`);
}
