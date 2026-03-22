/**
 * Workspace registry — manages multiple Nex workspaces on a single machine.
 *
 * Storage:
 *   ~/.nex/config.json          → registry (active_workspace + workspace list)
 *   ~/.nex/workspaces/<slug>/   → per-workspace credentials + state
 *
 * All functions accept an optional `baseDir` for testing (defaults to ~/.nex).
 */

import {
  existsSync, mkdirSync, readFileSync, writeFileSync,
  renameSync, rmSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_BASE_DIR = process.env.NEX_BASE_DIR || join(homedir(), ".nex");

// --- Types ---

export interface WorkspaceEntry {
  slug: string;
  nickname?: string;
  added_at: number;
}

export interface WorkspaceCredentials {
  api_key: string;
  email: string;
  workspace_id: string;
  workspace_slug: string;
}

export interface WorkspaceRegistry {
  active_workspace: string;
  workspaces: Record<string, { nickname?: string; added_at: number }>;
  [key: string]: unknown; // preserve extra global settings
}

// --- State file names that get moved during migration ---

const STATE_FILES = [
  "file-scan-manifest.json",
  "claude-sessions.json",
  "mcp-sessions.json",
  "cli-sessions.json",
  "recall-state.json",
  "rate-limiter.json",
];

// --- Core functions ---

export function loadRegistry(baseDir = DEFAULT_BASE_DIR): WorkspaceRegistry {
  const configPath = join(baseDir, "config.json");
  try {
    const raw = readFileSync(configPath, "utf-8");
    const data = JSON.parse(raw);
    if (data && data.active_workspace !== undefined && data.workspaces) {
      return data as WorkspaceRegistry;
    }
    // Flat config detected — trigger migration
    if (data && data.api_key) {
      migrateIfNeeded(baseDir);
      return JSON.parse(readFileSync(configPath, "utf-8")) as WorkspaceRegistry;
    }
    return { active_workspace: "", workspaces: {} };
  } catch {
    return { active_workspace: "", workspaces: {} };
  }
}

export function saveRegistry(registry: WorkspaceRegistry, baseDir = DEFAULT_BASE_DIR): void {
  mkdirSync(baseDir, { recursive: true });
  writeFileSync(join(baseDir, "config.json"), JSON.stringify(registry, null, 2), "utf-8");
}

export function addWorkspace(
  slug: string,
  credentials: WorkspaceCredentials,
  nickname?: string,
  baseDir = DEFAULT_BASE_DIR,
): void {
  const registry = loadRegistry(baseDir);
  const wsDir = join(baseDir, "workspaces", slug);
  mkdirSync(wsDir, { recursive: true });

  // Write credentials
  writeFileSync(join(wsDir, "credentials.json"), JSON.stringify(credentials, null, 2), "utf-8");

  // Update registry — preserve existing nickname if no new one provided
  const existing = registry.workspaces[slug];
  registry.workspaces[slug] = {
    nickname: nickname ?? existing?.nickname,
    added_at: existing?.added_at ?? Date.now(),
  };

  // Set as active if first workspace or no active set
  if (!registry.active_workspace || Object.keys(registry.workspaces).length === 1) {
    registry.active_workspace = slug;
  }

  saveRegistry(registry, baseDir);
}

export function removeWorkspace(slug: string, baseDir = DEFAULT_BASE_DIR): void {
  const registry = loadRegistry(baseDir);
  delete registry.workspaces[slug];

  // Clean up active_workspace pointer
  if (registry.active_workspace === slug) {
    const remaining = Object.keys(registry.workspaces);
    registry.active_workspace = remaining[0] ?? "";
  }

  // Remove workspace directory
  const wsDir = join(baseDir, "workspaces", slug);
  rmSync(wsDir, { recursive: true, force: true });

  saveRegistry(registry, baseDir);
}

export function switchWorkspace(slug: string, baseDir = DEFAULT_BASE_DIR): WorkspaceCredentials {
  const registry = loadRegistry(baseDir);
  if (!registry.workspaces[slug]) {
    throw new Error(`Workspace "${slug}" not found`);
  }
  registry.active_workspace = slug;
  saveRegistry(registry, baseDir);
  return loadCredentials(slug, baseDir);
}

export function renameWorkspace(slug: string, nickname: string, baseDir = DEFAULT_BASE_DIR): void {
  const registry = loadRegistry(baseDir);
  if (!registry.workspaces[slug]) {
    throw new Error(`Workspace "${slug}" not found`);
  }
  registry.workspaces[slug].nickname = nickname;
  saveRegistry(registry, baseDir);
}

export function getActiveCredentials(baseDir = DEFAULT_BASE_DIR): WorkspaceCredentials | undefined {
  const registry = loadRegistry(baseDir);
  if (!registry.active_workspace) return undefined;
  try {
    return loadCredentials(registry.active_workspace, baseDir);
  } catch {
    return undefined;
  }
}

export function listWorkspaces(baseDir = DEFAULT_BASE_DIR): (WorkspaceEntry & { email: string })[] {
  const registry = loadRegistry(baseDir);
  return Object.entries(registry.workspaces)
    .map(([slug, meta]) => {
      let email = "";
      try {
        const creds = loadCredentials(slug, baseDir);
        email = creds.email;
      } catch { /* missing credentials */ }
      return { slug, nickname: meta.nickname, added_at: meta.added_at, email };
    })
    .sort((a, b) => a.added_at - b.added_at);
}

/** Resolve the data directory for a workspace's state files. */
let _cachedDataDir: string | undefined;

export function workspaceDataDir(slug?: string, baseDir = DEFAULT_BASE_DIR): string {
  if (slug) {
    return join(baseDir, "workspaces", slug);
  }
  if (!_cachedDataDir) {
    const registry = loadRegistry(baseDir);
    if (registry.active_workspace) {
      _cachedDataDir = join(baseDir, "workspaces", registry.active_workspace);
    } else {
      // Fallback to base dir if no workspace (pre-registration)
      return baseDir;
    }
  }
  return _cachedDataDir;
}

/** Reset cached data dir (for testing or after workspace switch). */
export function resetDataDirCache(): void {
  _cachedDataDir = undefined;
}

/**
 * Resolve a workspace slug from a slug-or-nickname input.
 * Resolution: exact slug → case-insensitive nickname → null.
 */
export function resolveSlug(input: string, baseDir = DEFAULT_BASE_DIR): string | null {
  const registry = loadRegistry(baseDir);
  if (registry.workspaces[input]) return input;
  const lower = input.toLowerCase();
  for (const [slug, meta] of Object.entries(registry.workspaces)) {
    if (meta.nickname?.toLowerCase() === lower) return slug;
  }
  return null;
}

// --- Migration ---

export function migrateIfNeeded(baseDir = DEFAULT_BASE_DIR, legacyMcpPath?: string): void {
  const configPath = join(baseDir, "config.json");

  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return; // No config file — nothing to migrate
  }

  // Already migrated
  if (data.active_workspace !== undefined) return;

  // No api_key — nothing to migrate
  if (!data.api_key) return;

  const slug = (data.workspace_slug as string) || "default";
  const wsDir = join(baseDir, "workspaces", slug);
  mkdirSync(wsDir, { recursive: true });

  // Write credentials
  const credentials: WorkspaceCredentials = {
    api_key: data.api_key as string,
    email: (data.email as string) || "",
    workspace_id: String(data.workspace_id || ""),
    workspace_slug: slug,
  };
  writeFileSync(join(wsDir, "credentials.json"), JSON.stringify(credentials, null, 2), "utf-8");

  // Move state files
  for (const file of STATE_FILES) {
    const src = join(baseDir, file);
    const dest = join(wsDir, file);
    if (existsSync(src)) {
      try {
        renameSync(src, dest);
      } catch {
        // Cross-device move fallback
        writeFileSync(dest, readFileSync(src));
        rmSync(src);
      }
    }
  }

  // Build new config — preserve global settings, remove credential fields
  const { api_key, email, workspace_id, workspace_slug, ...globalSettings } = data;
  const newConfig: WorkspaceRegistry = {
    ...globalSettings,
    active_workspace: slug,
    workspaces: {
      [slug]: { added_at: Date.now() },
    },
  };

  writeFileSync(configPath, JSON.stringify(newConfig, null, 2), "utf-8");

  // Migrate legacy MCP config if present
  const mcpPath = legacyMcpPath ?? join(homedir(), ".nex-mcp.json");
  try {
    const mcpData = JSON.parse(readFileSync(mcpPath, "utf-8"));
    if (mcpData.api_key && mcpData.workspace_slug && mcpData.workspace_slug !== slug) {
      // Different workspace — add it
      const mcpSlug = mcpData.workspace_slug as string;
      const mcpWsDir = join(baseDir, "workspaces", mcpSlug);
      mkdirSync(mcpWsDir, { recursive: true });

      const mcpCreds: WorkspaceCredentials = {
        api_key: mcpData.api_key as string,
        email: (mcpData.email as string) || "",
        workspace_id: String(mcpData.workspace_id || ""),
        workspace_slug: mcpSlug,
      };
      writeFileSync(join(mcpWsDir, "credentials.json"), JSON.stringify(mcpCreds, null, 2), "utf-8");

      newConfig.workspaces[mcpSlug] = { added_at: Date.now() };
      writeFileSync(configPath, JSON.stringify(newConfig, null, 2), "utf-8");
    }

    // Backup legacy file
    renameSync(mcpPath, mcpPath + ".bak");
  } catch {
    // No MCP config or already backed up — fine
  }
}

// --- Helpers ---

function loadCredentials(slug: string, baseDir: string): WorkspaceCredentials {
  const credPath = join(baseDir, "workspaces", slug, "credentials.json");
  return JSON.parse(readFileSync(credPath, "utf-8")) as WorkspaceCredentials;
}
