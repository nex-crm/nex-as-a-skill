import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

/** Canonical config file — all writes go here. */
const CONFIG_PATH = join(homedir(), ".nex", "config.json");

/**
 * Legacy config file — read-only fallback for backward compatibility.
 * Existing installations may still have credentials here. We read from it
 * but never write to it. All new writes go to CONFIG_PATH.
 */
const LEGACY_CONFIG_PATH = join(homedir(), ".nex-mcp.json");

interface NexMcpConfig {
  api_key?: string;
  base_url?: string;
  dev_url?: string;
  workspace_id?: string;
  workspace_slug?: string;
  [key: string]: unknown;
}

/**
 * Load config from ~/.nex/config.json, falling back to legacy ~/.nex-mcp.json.
 * Fields from the canonical config take precedence.
 */
export function loadConfig(): NexMcpConfig {
  let canonical: NexMcpConfig = {};
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    canonical = JSON.parse(raw) as NexMcpConfig;
  } catch {
    // Canonical config doesn't exist yet
  }

  // If canonical has an api_key, use it directly (no need to read legacy)
  if (canonical.api_key) return canonical;

  // Legacy fallback — backward compatibility for existing installations
  let legacy: NexMcpConfig = {};
  try {
    const raw = readFileSync(LEGACY_CONFIG_PATH, "utf-8");
    legacy = JSON.parse(raw) as NexMcpConfig;
  } catch {
    // Legacy config doesn't exist
  }

  // Merge: canonical fields take precedence over legacy
  return { ...legacy, ...canonical };
}

export function saveConfig(config: NexMcpConfig): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function loadApiKey(): string | undefined {
  return process.env.NEX_API_KEY || loadConfig().api_key || undefined;
}

/** Write registration data to ~/.nex/config.json (canonical config). */
export function persistRegistration(data: Record<string, unknown>): void {
  const existing = loadConfig();
  if (typeof data.api_key === "string") existing.api_key = data.api_key;
  if (typeof data.workspace_id === "string" || typeof data.workspace_id === "number") {
    existing.workspace_id = String(data.workspace_id);
  }
  if (typeof data.workspace_slug === "string") existing.workspace_slug = data.workspace_slug;
  saveConfig(existing);
}

export { CONFIG_PATH };
