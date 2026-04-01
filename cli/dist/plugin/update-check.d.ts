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
export {};
