/**
 * Legacy persistence for ~/.nex-mcp.json.
 *
 * DEPRECATED: All new config reads/writes should use ~/.nex/config.json
 * via lib/config.ts. This module is kept for backward compatibility only.
 * ~/.nex-mcp.json is read-only — never write to it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const MCP_CONFIG_PATH = join(homedir(), ".nex-mcp.json");

export interface NexMcpConfig {
  api_key?: string;
  workspace_id?: string;
  workspace_slug?: string;
  base_url?: string;
}

/** Read legacy ~/.nex-mcp.json. Prefer lib/config.ts loadConfig() instead. */
export function loadMcpConfig(): NexMcpConfig {
  try {
    const raw = readFileSync(MCP_CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as NexMcpConfig;
  } catch {
    return {};
  }
}

/**
 * @deprecated No longer writes to ~/.nex-mcp.json. Use lib/config.ts saveConfig() instead.
 * Kept as a no-op to avoid breaking callers that haven't been updated yet.
 */
export function saveMcpConfig(_config: NexMcpConfig): void {
  // No-op: ~/.nex-mcp.json is now read-only (legacy fallback).
  // All writes go to ~/.nex/config.json via lib/config.ts.
}

export function getMcpConfigPath(): string {
  return MCP_CONFIG_PATH;
}
