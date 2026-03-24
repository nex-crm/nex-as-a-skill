/**
 * Nex Channel — pushes daily digests and proactive notifications
 * into active Claude Code sessions via the Channels API.
 *
 * Fetches notification preferences and pending notifications from
 * the Nex API. Frequency is controlled server-side via the
 * notifications/preferences endpoint.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { NexApiClient } from "./client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DigestState {
  lastDigestAt: number; // epoch ms
}

interface NotificationPreferences {
  frequency_minutes?: number;
  enabled_types?: string[];
  digest_enabled?: boolean;
}

interface Notification {
  id?: string;
  type?: string;
  content?: string;
  importance?: string;
  created_at?: string;
}

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
const DIGEST_STATE_PATH = join(STATE_DIR, "channel-state.json");

/** How often to check whether a daily digest is due (1 hour). */
const DIGEST_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Minimum gap between daily digests (24 hours). */
const DIGEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Default notification polling interval if API doesn't specify one (15 minutes). */
const DEFAULT_NOTIFY_INTERVAL_MS = 15 * 60 * 1000;

/** Override: set via NEX_NOTIFY_INTERVAL_MINUTES env var (e.g. "1" for 1m). */
const NOTIFY_INTERVAL_OVERRIDE_MS = process.env.NEX_NOTIFY_INTERVAL_MINUTES
  ? Math.max(1, parseInt(process.env.NEX_NOTIFY_INTERVAL_MINUTES, 10)) * 60 * 1000
  : 0;

/** Delay before the first checks after startup (10 seconds). */
const INITIAL_DELAY_MS = 10_000;

// ---------------------------------------------------------------------------
// Digest state (local — digest is client-initiated)
// ---------------------------------------------------------------------------

function loadDigestState(): DigestState {
  try {
    if (existsSync(DIGEST_STATE_PATH)) {
      const data = JSON.parse(readFileSync(DIGEST_STATE_PATH, "utf-8"));
      return { lastDigestAt: data.lastDigestAt ?? 0 };
    }
  } catch {
    // Corrupted or unreadable — start fresh
  }
  return { lastDigestAt: 0 };
}

function saveDigestState(state: DigestState): void {
  try {
    if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(DIGEST_STATE_PATH, JSON.stringify(state));
  } catch {
    // Best-effort
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
  try {
    await server.notification({
      method: "notifications/claude/channel",
      params: { content, meta },
    });
    console.error(`[nex-channel] pushed ${meta.type || "event"} (${content.length} chars)`);
  } catch (err) {
    console.error("[nex-channel] push failed:", (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Fetch preferences from API
// ---------------------------------------------------------------------------

async function fetchPreferences(client: NexApiClient): Promise<NotificationPreferences> {
  try {
    return (await client.get("/v1/notifications/preferences")) as NotificationPreferences;
  } catch (err) {
    console.error("[nex-channel] failed to fetch preferences:", (err as Error).message);
    return {};
  }
}

// ---------------------------------------------------------------------------
// Digest logic (client-initiated, local state)
// ---------------------------------------------------------------------------

async function checkDigest(
  server: NotificationSender,
  client: NexApiClient,
  state: DigestState,
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
      saveDigestState(state);
    }
  } catch (err) {
    console.error("[nex-channel] digest check failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Proactive notification logic (polls /v1/notifications/feed)
// ---------------------------------------------------------------------------

/** Track the last seen sent_at so we only fetch new items. */
let lastFeedCheckAt: string | undefined;

interface FeedContentItem {
  title?: string;
  context?: string;
  estimated_time?: string;
}

interface FeedItemContent {
  important_items?: FeedContentItem[];
  entity_changes?: FeedContentItem[];
}

interface FeedItem {
  id?: string;
  type?: string;
  status?: string;
  alert_time?: string;
  sent_at?: string;
  content?: FeedItemContent;
}

async function checkNotifications(
  server: NotificationSender,
  client: NexApiClient,
): Promise<void> {
  try {
    const params = new URLSearchParams({ limit: "10" });
    if (lastFeedCheckAt) params.set("since", lastFeedCheckAt);

    const result = (await client.get(
      `/v1/notifications/feed?${params.toString()}`,
    )) as {
      items?: FeedItem[];
    };

    const items = result.items ?? [];
    if (items.length === 0) return;

    // Update cursor to the most recent sent_at
    for (const item of items) {
      if (item.sent_at && (!lastFeedCheckAt || item.sent_at > lastFeedCheckAt)) {
        lastFeedCheckAt = item.sent_at;
      }
    }

    // Format feed items into a readable summary
    const lines: string[] = [];
    for (const item of items) {
      if (item.content?.important_items) {
        for (const ci of item.content.important_items) {
          lines.push(`- [important] ${ci.title}${ci.context ? ` — ${ci.context}` : ""}`);
        }
      }
      if (item.content?.entity_changes) {
        for (const ci of item.content.entity_changes) {
          lines.push(`- [change] ${ci.title}${ci.context ? ` — ${ci.context}` : ""}`);
        }
      }
    }

    if (lines.length === 0) return;

    await pushChannelEvent(server, lines.join("\n"), {
      type: "proactive_notification",
      count: String(items.length),
    });
  } catch (err) {
    console.error("[nex-channel] notification check failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Scheduling with setTimeout chains (allows dynamic interval)
// ---------------------------------------------------------------------------

function scheduleDigestLoop(
  server: NotificationSender,
  client: NexApiClient,
  state: DigestState,
): void {
  const run = async () => {
    await checkDigest(server, client, state);
    setTimeout(run, DIGEST_CHECK_INTERVAL_MS);
  };
  setTimeout(run, INITIAL_DELAY_MS);
}

function scheduleNotificationLoop(
  server: NotificationSender,
  client: NexApiClient,
  intervalMs: number,
): void {
  const run = async () => {
    await checkNotifications(server, client);
    // Re-fetch preferences each cycle to pick up frequency changes
    const prefs = await fetchPreferences(client);
    const nextInterval = NOTIFY_INTERVAL_OVERRIDE_MS ||
      (prefs.frequency_minutes ?? intervalMs / 60_000) * 60_000;
    setTimeout(run, nextInterval);
  };
  setTimeout(run, INITIAL_DELAY_MS + 5_000); // stagger slightly after digest
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Start the Nex notification channel. Call this after the MCP server
 * has connected to its transport.
 *
 * Fetches notification preferences from the API to determine polling
 * frequency. Digest state is kept locally (client-initiated).
 */
export async function startChannel(
  server: NotificationSender,
  client: NexApiClient,
): Promise<void> {
  if (!client.isAuthenticated) return;

  // Fetch initial preferences
  const prefs = await fetchPreferences(client);
  const intervalMs = NOTIFY_INTERVAL_OVERRIDE_MS ||
    (prefs.frequency_minutes ?? DEFAULT_NOTIFY_INTERVAL_MS / 60_000) * 60_000;

  // Digest uses local state (client-initiated)
  const digestState = loadDigestState();
  scheduleDigestLoop(server, client, digestState);

  // Notifications use API-backed state and server-controlled frequency
  scheduleNotificationLoop(server, client, intervalMs);

  console.error(`[nex-channel] started (digest: 24h, notifications: ${intervalMs / 60_000}m)`);
}
