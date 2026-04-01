#!/usr/bin/env node
/**
 * Claude Code SessionStart hook — bulk context load from Nex + file scan.
 *
 * Fires once when a new Claude Code session begins. Queries Nex for
 * a baseline context summary and injects it so the agent "already knows"
 * relevant business context from the first message.
 *
 * On startup/clear: also scans project files and ingests changed ones.
 * On compact/resume: skips file scan (files already ingested, just re-query summary).
 *
 * On ANY error: outputs {} and exits 0 (graceful degradation).
 */
export {};
