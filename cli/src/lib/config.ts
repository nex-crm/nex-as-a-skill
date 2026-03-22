/**
 * Configuration resolution: CLI flags > env vars > config file.
 * Base URL is hardcoded to production (NEX_DEV_URL escape hatch for local dev).
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { getActiveCredentials, addWorkspace } from "./workspace-registry.js";

export const CONFIG_PATH = join(homedir(), ".nex", "config.json");
export const BASE_URL = process.env.NEX_DEV_URL ?? loadConfig().dev_url ?? "https://app.nex.ai";
export const API_BASE = `${BASE_URL}/api/developers`;
export const REGISTER_URL = `${BASE_URL}/api/v1/agents/register`;

export interface NexConfig {
  api_key?: string;
  email?: string;
  workspace_id?: string;
  workspace_slug?: string;
  default_format?: string;
  default_timeout?: number;
  [key: string]: unknown;
}

export function loadConfig(): NexConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const data = JSON.parse(raw);

    // If migrated format, merge active workspace credentials into return
    if (data.active_workspace && !data.api_key) {
      const wsCreds = getActiveCredentials();
      if (wsCreds) {
        return { ...data, ...wsCreds } as NexConfig;
      }
    }

    return data as NexConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: NexConfig): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/**
 * Resolve API key from: flag > env > active workspace > config file.
 */
export function resolveApiKey(flagValue?: string): string | undefined {
  if (flagValue) return flagValue;
  if (process.env.NEX_API_KEY) return process.env.NEX_API_KEY;

  // Try active workspace credentials
  const wsCreds = getActiveCredentials();
  if (wsCreds?.api_key) return wsCreds.api_key;

  // Legacy fallback: flat config.json (pre-migration)
  return loadConfig().api_key || undefined;
}

/**
 * Resolve output format from: flag > config file > default.
 */
export function resolveFormat(flagValue?: string): string {
  if (flagValue) return flagValue;
  const configured = loadConfig().default_format;
  if (configured) return configured;
  // Default to "text" for TTY (rich TUI output), "json" for piped/scripted usage
  return process.stdout.isTTY ? "text" : "json";
}

/**
 * Resolve timeout from: flag > config file > default.
 */
export function resolveTimeout(flagValue?: string): number {
  if (flagValue) return parseInt(flagValue, 10);
  return loadConfig().default_timeout ?? 120_000;
}

/**
 * Persist registration data to config file and workspace registry.
 */
export function persistRegistration(data: Record<string, unknown>): void {
  // Legacy: still write to config.json for backwards compat during migration
  const existing = loadConfig();
  if (typeof data.api_key === "string") existing.api_key = data.api_key;
  if (typeof data.email === "string") existing.email = data.email;
  if (typeof data.workspace_id === "string" || typeof data.workspace_id === "number") {
    existing.workspace_id = String(data.workspace_id);
  }
  if (typeof data.workspace_slug === "string") existing.workspace_slug = data.workspace_slug;
  saveConfig(existing);

  // New: add to workspace registry
  const slug = (data.workspace_slug as string) || (data.workspace_id as string);
  if (slug && data.api_key) {
    addWorkspace(slug, {
      api_key: data.api_key as string,
      email: (data.email as string) || "",
      workspace_id: String(data.workspace_id || ""),
      workspace_slug: slug,
    });
  }
}
