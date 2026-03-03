/**
 * Plugin configuration parsing and validation.
 * Resolves API key from config, env var, ${VAR} interpolation,
 * or ~/.nex-mcp.json fallback (shared with MCP server).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface NexPluginConfig {
  apiKey: string;
  baseUrl: string;
  autoRecall: boolean;
  autoCapture: boolean;
  captureMode: "last_turn" | "full_session";
  maxRecallResults: number;
  sessionTracking: boolean;
  recallTimeoutMs: number;
  debug: boolean;
}

export interface ScanConfig {
  extensions: string[];
  maxFileSize: number;
  maxFilesPerScan: number;
  scanDepth: number;
  ignoreDirs: string[];
  enabled: boolean;
}

const DEFAULTS: Omit<NexPluginConfig, "apiKey"> = {
  baseUrl: "https://api.nex-crm.com",
  autoRecall: true,
  autoCapture: true,
  captureMode: "last_turn",
  maxRecallResults: 5,
  sessionTracking: true,
  recallTimeoutMs: 1500,
  debug: false,
};

/** Resolve ${VAR_NAME} patterns in a string value. */
function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName: string) => {
    return process.env[varName.trim()] ?? "";
  });
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

// --- Shared MCP config (registration data) ---

/** Shared config file with MCP server — stores registration data. */
export const MCP_CONFIG_PATH = join(homedir(), ".nex-mcp.json");

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
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Write registration data to ~/.nex-mcp.json. */
export function persistRegistration(data: Record<string, unknown>): void {
  const existing = loadMcpConfig();
  if (typeof data.api_key === "string") existing.api_key = data.api_key;
  if (typeof data.workspace_id === "string" || typeof data.workspace_id === "number") {
    existing.workspace_id = String(data.workspace_id);
  }
  if (typeof data.workspace_slug === "string") existing.workspace_slug = data.workspace_slug;
  writeFileSync(MCP_CONFIG_PATH, JSON.stringify(existing, null, 2) + "\n", "utf-8");
}

/** Load base URL without requiring an API key. Used for registration. */
export function loadBaseUrl(): string {
  let baseUrl = process.env.NEX_API_BASE_URL ?? DEFAULTS.baseUrl;
  return baseUrl.replace(/\/+$/, "");
}

/**
 * Parse raw plugin config into a validated NexPluginConfig.
 * Falls back to process.env.NEX_API_KEY, then ~/.nex-mcp.json.
 */
export function parseConfig(raw?: Record<string, unknown>): NexPluginConfig {
  const cfg = raw ?? {};

  // Resolve API key: config → env var interpolation → NEX_API_KEY env → ~/.nex-mcp.json
  let apiKey = typeof cfg.apiKey === "string" ? resolveEnvVars(cfg.apiKey) : undefined;
  if (!apiKey) {
    apiKey = process.env.NEX_API_KEY;
  }
  if (!apiKey) {
    const mcpConfig = loadMcpConfig();
    apiKey = mcpConfig.api_key;
  }
  if (!apiKey) {
    throw new ConfigError(
      "No API key configured. Set 'apiKey' in plugin config, export NEX_API_KEY, or run /register to create an account."
    );
  }

  let baseUrl = typeof cfg.baseUrl === "string" ? resolveEnvVars(cfg.baseUrl) : DEFAULTS.baseUrl;
  // Strip trailing slash
  baseUrl = baseUrl.replace(/\/+$/, "");

  const captureMode = cfg.captureMode as string | undefined;
  if (captureMode !== undefined && captureMode !== "last_turn" && captureMode !== "full_session") {
    throw new ConfigError(`Invalid captureMode: "${captureMode}". Must be "last_turn" or "full_session".`);
  }

  const maxRecallResults = typeof cfg.maxRecallResults === "number" ? cfg.maxRecallResults : DEFAULTS.maxRecallResults;
  if (maxRecallResults < 1 || maxRecallResults > 20) {
    throw new ConfigError(`maxRecallResults must be between 1 and 20, got ${maxRecallResults}.`);
  }

  const recallTimeoutMs = typeof cfg.recallTimeoutMs === "number" ? cfg.recallTimeoutMs : DEFAULTS.recallTimeoutMs;
  if (recallTimeoutMs < 500 || recallTimeoutMs > 10000) {
    throw new ConfigError(`recallTimeoutMs must be between 500 and 10000, got ${recallTimeoutMs}.`);
  }

  return {
    apiKey,
    baseUrl,
    autoRecall: typeof cfg.autoRecall === "boolean" ? cfg.autoRecall : DEFAULTS.autoRecall,
    autoCapture: typeof cfg.autoCapture === "boolean" ? cfg.autoCapture : DEFAULTS.autoCapture,
    captureMode: (captureMode as NexPluginConfig["captureMode"]) ?? DEFAULTS.captureMode,
    maxRecallResults,
    sessionTracking: typeof cfg.sessionTracking === "boolean" ? cfg.sessionTracking : DEFAULTS.sessionTracking,
    recallTimeoutMs,
    debug: typeof cfg.debug === "boolean" ? cfg.debug : DEFAULTS.debug,
  };
}

// --- Scan config ---

const DEFAULT_SCAN_EXTENSIONS = [".md", ".txt", ".csv", ".json", ".yaml", ".yml"];
const DEFAULT_IGNORE_DIRS = [
  "node_modules", ".git", "dist", "build", ".next", "__pycache__",
  "vendor", ".venv", ".claude", ".openclaw", "coverage", ".turbo", ".cache",
];

/**
 * Parse scan config from plugin config or environment variables.
 * All fields have sensible defaults; enabled=false is the kill switch.
 */
export function parseScanConfig(pluginCfg?: NexPluginConfig | Record<string, unknown>): ScanConfig {
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
