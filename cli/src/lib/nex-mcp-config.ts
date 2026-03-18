/**
 * Shared persistence for ~/.nex-mcp.json.
 * Used by the MCP server and hooks to read API credentials without
 * depending on the full CLI config.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const MCP_CONFIG_PATH = join(homedir(), ".nex-mcp.json");

export interface NexMcpConfig {
  api_key?: string;
  workspace_id?: string;
  workspace_slug?: string;
  base_url?: string;
}

export function loadMcpConfig(): NexMcpConfig {
  try {
    const raw = readFileSync(MCP_CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as NexMcpConfig;
  } catch {
    return {};
  }
}

export function saveMcpConfig(config: NexMcpConfig): void {
  mkdirSync(dirname(MCP_CONFIG_PATH), { recursive: true });
  writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function getMcpConfigPath(): string {
  return MCP_CONFIG_PATH;
}
