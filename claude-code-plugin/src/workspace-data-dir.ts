/**
 * Resolve the active workspace's data directory.
 * Reads from ~/.nex/config.json (workspace registry format).
 * Falls back to ~/.nex/ if no workspace is configured (pre-migration).
 *
 * Lightweight reader — no migration logic.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const BASE_DIR = process.env.NEX_BASE_DIR || join(homedir(), ".nex");

let _cached: string | undefined;

export function workspaceDataDir(): string {
  if (_cached) return _cached;
  try {
    const raw = readFileSync(join(BASE_DIR, "config.json"), "utf-8");
    const config = JSON.parse(raw);
    if (config.active_workspace) {
      _cached = join(BASE_DIR, "workspaces", config.active_workspace);
      return _cached;
    }
  } catch { /* No config or parse error — fall back */ }
  return BASE_DIR;
}

export function resetWorkspaceCache(): void {
  _cached = undefined;
}
