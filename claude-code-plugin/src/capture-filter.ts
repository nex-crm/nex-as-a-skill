/**
 * Capture filtering for Claude Code — decides what content to send to Nex.
 * Adapted from openclaw-plugin for plain string input.
 */

import { stripNexContext } from "./context-format.js";

const MIN_LENGTH = 20;
const MAX_LENGTH = 50_000;

/**
 * Simple content hash for deduplication.
 */
function hashContent(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash.toString(36);
}

interface CacheEntry {
  hash: string;
  timestamp: number;
}

const DEDUP_MAX = 50;
const DEDUP_TTL_MS = 60 * 60 * 1000; // 1 hour

const dedupCache: CacheEntry[] = [];

function isDuplicate(hash: string): boolean {
  const now = Date.now();
  // Evict expired entries
  while (dedupCache.length > 0 && now - dedupCache[0].timestamp > DEDUP_TTL_MS) {
    dedupCache.shift();
  }
  if (dedupCache.some((e) => e.hash === hash)) {
    return true;
  }
  dedupCache.push({ hash, timestamp: now });
  if (dedupCache.length > DEDUP_MAX) {
    dedupCache.shift();
  }
  return false;
}

export interface CaptureResult {
  text: string;
  skipped: false;
}

export interface CaptureSkip {
  reason: string;
  skipped: true;
}

/**
 * Filter text for capture eligibility.
 * Works with plain strings (Claude Code messages).
 */
export function captureFilter(text: string): CaptureResult | CaptureSkip {
  if (!text || text.trim().length === 0) {
    return { skipped: true, reason: "empty text" };
  }

  // Strip injected context blocks (prevent feedback loop)
  let cleaned = stripNexContext(text);

  // Skip slash commands
  if (cleaned.startsWith("/")) {
    return { skipped: true, reason: "slash command" };
  }

  // Skip too short
  if (cleaned.length < MIN_LENGTH) {
    return { skipped: true, reason: `too short (${cleaned.length} chars)` };
  }

  // Skip too long
  if (cleaned.length > MAX_LENGTH) {
    return { skipped: true, reason: `too long (${cleaned.length} chars)` };
  }

  // Dedup check
  const hash = hashContent(cleaned);
  if (isDuplicate(hash)) {
    return { skipped: true, reason: "duplicate content" };
  }

  return { skipped: false, text: cleaned };
}
