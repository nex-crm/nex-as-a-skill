#!/usr/bin/env node
/**
 * nex-update-check — lightweight version check with caching.
 *
 * Outputs one of:
 *   UPGRADE_AVAILABLE <current> <latest>
 *   (nothing — up to date, snoozed, disabled, or cached)
 *
 * Designed to run inline in session start hooks with minimal latency.
 * Caches results to ~/.nex/last-update-check (60 min TTL for "up to date",
 * 720 min for "upgrade available"). Supports snooze with escalating backoff.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

const NEX_DIR = join(homedir(), ".nex");
const CACHE_PATH = join(NEX_DIR, "last-update-check");
const SNOOZE_PATH = join(NEX_DIR, "update-snoozed");
const UPGRADED_PATH = join(NEX_DIR, "just-upgraded-from");

const UP_TO_DATE_TTL_MS = 60 * 60 * 1000;       // 60 min
const UPGRADE_AVAIL_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Snooze escalation: 24h → 48h → 7d
const SNOOZE_LEVELS_MS = [
  24 * 60 * 60 * 1000,
  48 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
];

interface CacheEntry {
  current: string;
  latest: string;
  status: "up_to_date" | "upgrade_available";
  checked_at: number;
}

interface SnoozeEntry {
  version: string;
  level: number;
  snoozed_at: number;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(NEX_DIR, { recursive: true });
  writeFileSync(path, JSON.stringify(data) + "\n", "utf-8");
}

/** Check if snoozed for current latest version. */
function isSnoozed(latestVersion: string): boolean {
  const snooze = readJson<SnoozeEntry>(SNOOZE_PATH);
  if (!snooze) return false;
  if (snooze.version !== latestVersion) return false; // new version resets snooze

  const level = Math.min(snooze.level, SNOOZE_LEVELS_MS.length - 1);
  const elapsed = Date.now() - snooze.snoozed_at;
  return elapsed < SNOOZE_LEVELS_MS[level];
}

/** Check if we just upgraded (marker left by upgrade command). */
function checkJustUpgraded(): string | null {
  try {
    const old = readFileSync(UPGRADED_PATH, "utf-8").trim();
    // Clean up the marker
    try { writeFileSync(UPGRADED_PATH, "", "utf-8"); } catch { /* ignore */ }
    return old;
  } catch {
    return null;
  }
}

function fetchLatestVersion(): string | null {
  try {
    const raw = execFileSync(
      "curl",
      ["-sf", "--max-time", "5", "https://registry.npmjs.org/@nex-ai/nex/latest"],
      { encoding: "utf-8", timeout: 6000 },
    );
    const data = JSON.parse(raw);
    const ver = data.version;
    if (typeof ver === "string" && /^\d+\.\d+\.\d+/.test(ver)) return ver;
    return null;
  } catch {
    return null;
  }
}

function main(): void {
  const current = pkg.version;

  // Check if update checking is disabled
  try {
    const config = readJson<Record<string, unknown>>(join(NEX_DIR, "config.json"));
    if (config?.update_check === false) return;
  } catch { /* continue */ }

  // Check for just-upgraded marker
  const upgradedFrom = checkJustUpgraded();
  if (upgradedFrom && upgradedFrom !== current) {
    console.log(`JUST_UPGRADED ${upgradedFrom} ${current}`);
    // Clear stale cache
    writeJson(CACHE_PATH, { current, latest: current, status: "up_to_date", checked_at: Date.now() });
    return;
  }

  // Fast path: check cache
  const cached = readJson<CacheEntry>(CACHE_PATH);
  if (cached && cached.current === current) {
    const age = Date.now() - cached.checked_at;
    const ttl = cached.status === "up_to_date" ? UP_TO_DATE_TTL_MS : UPGRADE_AVAIL_TTL_MS;
    if (age < ttl) {
      if (cached.status === "upgrade_available" && !isSnoozed(cached.latest)) {
        console.log(`UPGRADE_AVAILABLE ${current} ${cached.latest}`);
      }
      return;
    }
  }

  // Slow path: fetch from registry
  const latest = fetchLatestVersion();
  if (!latest) return; // network error — fail silently

  const status = compareVersions(latest, current) > 0 ? "upgrade_available" : "up_to_date";

  // Write cache
  writeJson(CACHE_PATH, { current, latest, status, checked_at: Date.now() } satisfies CacheEntry);

  if (status === "upgrade_available" && !isSnoozed(latest)) {
    console.log(`UPGRADE_AVAILABLE ${current} ${latest}`);
  }
}

main();
