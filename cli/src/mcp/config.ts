import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { workspaceDataDir } from "./workspace-data-dir.js";

const CONFIG_PATH = join(homedir(), ".nex", "config.json");

interface NexMcpConfig {
  api_key?: string;
  base_url?: string;
  dev_url?: string;
  workspace_id?: string;
  workspace_slug?: string;
  [key: string]: unknown;
}

export function loadConfig(): NexMcpConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as NexMcpConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: NexMcpConfig): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

interface WorkspaceCredentials {
  api_key?: string;
  [key: string]: unknown;
}

export function loadWorkspaceCredentials(): WorkspaceCredentials {
  try {
    const credPath = join(workspaceDataDir(), "credentials.json");
    const raw = readFileSync(credPath, "utf-8");
    return JSON.parse(raw) as WorkspaceCredentials;
  } catch {
    return {};
  }
}

export function loadApiKey(): string | undefined {
  // NEX_API_KEY env → workspace credentials → legacy config → undefined
  return (
    process.env.NEX_API_KEY ||
    loadWorkspaceCredentials().api_key ||
    loadConfig().api_key ||
    undefined
  );
}

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
