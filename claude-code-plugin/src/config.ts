/**
 * Plugin configuration — reads from environment variables,
 * with fallback to ~/.nex-mcp.json (shared with MCP server).
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

export interface NexConfig {
  apiKey: string;
  baseUrl: string;
}

export interface ScanConfig {
  extensions: string[];
  maxFileSize: number;
  maxFilesPerScan: number;
  scanDepth: number;
  ignoreDirs: string[];
  enabled: boolean;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Shared config file with MCP server — stores registration data. */
const MCP_CONFIG_PATH = join(homedir(), ".nex-mcp.json");

export { MCP_CONFIG_PATH };

interface McpConfig {
  api_key?: string;
  base_url?: string;
  workspace_id?: string;
  workspace_slug?: string;
}

/** Read ~/.nex-mcp.json (shared with MCP server registration). */
export function loadMcpConfig(): McpConfig {
  try {
    const raw = readFileSync(MCP_CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as McpConfig;
  } catch {
    return {};
  }
}

/** Write registration data to ~/.nex-mcp.json. */
export function persistRegistration(data: Record<string, unknown>): void {
  const existing = loadMcpConfig() as Record<string, unknown>;
  if (typeof data.api_key === "string") existing.api_key = data.api_key;
  if (typeof data.workspace_id === "string" || typeof data.workspace_id === "number") {
    existing.workspace_id = String(data.workspace_id);
  }
  if (typeof data.workspace_slug === "string") existing.workspace_slug = data.workspace_slug;
  mkdirSync(dirname(MCP_CONFIG_PATH), { recursive: true });
  writeFileSync(MCP_CONFIG_PATH, JSON.stringify(existing, null, 2) + "\n", "utf-8");
}

/**
 * Load config from environment variables, with fallback to ~/.nex-mcp.json.
 *
 * Priority: NEX_API_KEY env > ~/.nex-mcp.json api_key
 * If neither is set, throws ConfigError with registration instructions.
 */
export function loadConfig(): NexConfig {
  let apiKey = process.env.NEX_API_KEY;

  if (!apiKey) {
    // Fallback to shared MCP config
    const mcpConfig = loadMcpConfig();
    apiKey = mcpConfig.api_key;
  }

  if (!apiKey) {
    throw new ConfigError(
      "No API key found. Set NEX_API_KEY or run /register to create an account."
    );
  }

  let baseUrl = process.env.NEX_API_BASE_URL ?? "https://app.nex.ai";
  // Strip trailing slash
  baseUrl = baseUrl.replace(/\/+$/, "");

  return { apiKey, baseUrl };
}

/**
 * Load base URL without requiring an API key.
 * Used for registration (which doesn't need auth).
 */
export function loadBaseUrl(): string {
  let baseUrl = process.env.NEX_API_BASE_URL ?? "https://app.nex.ai";
  return baseUrl.replace(/\/+$/, "");
}

const DEFAULT_SCAN_EXTENSIONS = [".md", ".txt", ".csv", ".json", ".yaml", ".yml"];
const DEFAULT_IGNORE_DIRS = [
  "node_modules", ".git", "dist", "build", ".next", "__pycache__",
  "vendor", ".venv", ".claude", "coverage", ".turbo", ".cache",
];

/**
 * Load scan config from NEX_SCAN_* environment variables.
 * All fields have sensible defaults; NEX_SCAN_ENABLED=false is the kill switch.
 */
export function loadScanConfig(): ScanConfig {
  const enabled = (process.env.NEX_SCAN_ENABLED ?? "true").toLowerCase() !== "false";

  const extensions = process.env.NEX_SCAN_EXTENSIONS
    ? process.env.NEX_SCAN_EXTENSIONS.split(",").map((e) => e.trim())
    : DEFAULT_SCAN_EXTENSIONS;

  const maxFileSize = process.env.NEX_SCAN_MAX_FILE_SIZE
    ? parseInt(process.env.NEX_SCAN_MAX_FILE_SIZE, 10)
    : 100_000;

  const maxFilesPerScan = process.env.NEX_SCAN_MAX_FILES
    ? parseInt(process.env.NEX_SCAN_MAX_FILES, 10)
    : 5;

  const scanDepth = process.env.NEX_SCAN_DEPTH
    ? parseInt(process.env.NEX_SCAN_DEPTH, 10)
    : 2;

  const ignoreDirs = process.env.NEX_SCAN_IGNORE_DIRS
    ? process.env.NEX_SCAN_IGNORE_DIRS.split(",").map((d) => d.trim())
    : DEFAULT_IGNORE_DIRS;

  return { extensions, maxFileSize, maxFilesPerScan, scanDepth, ignoreDirs, enabled };
}
