# Workspace Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `nex workspace` commands so users can register, switch, rename, and delete workspaces stored locally, with per-workspace state isolation.

**Architecture:** A workspace registry (`~/.nex/config.json`) tracks all workspaces and points to the active one. Each workspace gets an isolated directory (`~/.nex/workspaces/<slug>/`) containing credentials and state files. Migration from the current flat config happens lazily on first registry load.

**Tech Stack:** TypeScript, Commander.js, raw stdin (ANSI picker), Node.js fs. Tests: bun:test.

**Spec:** `docs/superpowers/specs/2026-03-22-workspace-management-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `cli/src/lib/workspace-registry.ts` | Registry data layer: load/save/migrate/add/remove/switch/rename workspaces |
| `cli/src/commands/workspace.ts` | Commander commands + interactive picker UI |
| `claude-code-plugin/src/workspace-data-dir.ts` | Workspace path resolver for plugin (lightweight, no registry dependency) |
| `mcp/src/workspace-data-dir.ts` | Workspace path resolver for MCP (same as plugin, intentionally duplicated to avoid cross-package imports) |
| `cli/tests/lib/workspace-registry.test.ts` | Unit tests for registry logic |
| `cli/tests/integration/workspace.test.ts` | Integration tests for CLI commands |

### Modified Files
| File | Change |
|------|--------|
| `cli/src/lib/config.ts` | `resolveApiKey()` and `loadConfig()` read from active workspace credentials |
| `cli/src/index.ts` | Add `workspace` to `INTERACTIVE_COMMANDS` |
| `cli/src/commands/register.ts` | Call `addWorkspace()` after registration |
| `cli/src/commands/setup.ts` | Call `addWorkspace()` after setup |
| `cli/src/cli.ts` | Register `workspace` command |
| `claude-code-plugin/src/config.ts` | Read credentials from workspace dir, remove `~/.nex-mcp.json` dependency |
| `claude-code-plugin/src/auto-register.ts` | Persist via `addWorkspace()` |
| `claude-code-plugin/src/file-manifest.ts` | Lazy workspace-aware path |
| `claude-code-plugin/src/session-store.ts` | Pass `workspaceDataDir()` as data dir |
| `claude-code-plugin/src/rate-limiter.ts` | Workspace-aware data dir |
| `claude-code-plugin/src/recall-filter.ts` | Lazy workspace-aware path |
| `mcp/src/config.ts` | Read credentials from workspace dir |
| `mcp/src/file-manifest.ts` | Lazy workspace-aware path |
| `mcp/src/session-store.ts` | Pass `workspaceDataDir()` as data dir |
| `mcp/src/rate-limiter.ts` | Workspace-aware data dir |

**Note on `cli/src/plugin/`:** This directory is synced from `claude-code-plugin/src/` during build. Changes to `claude-code-plugin/src/` automatically propagate via `rsync -a` (without `--delete` — the CLI plugin has additional files like `shared.ts` that don't exist in the plugin package). The rsync command in Task 8 must use `rsync -a` NOT `rsync -a --delete`.

---

## Task 1: Workspace Registry Core

**The foundation. Pure data layer, no UI, no side effects beyond `~/.nex/` file I/O.**

**Files:**
- Create: `cli/src/lib/workspace-registry.ts`
- Test: `cli/tests/lib/workspace-registry.test.ts`

### Tests First

- [ ] **Step 1: Write failing tests for registry operations**

Create `cli/tests/lib/workspace-registry.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

// We'll test against a temp directory to avoid touching real ~/.nex/
const TEST_DIR = join(import.meta.dir, "../../.test-nex");

// The registry module will accept a base dir for testing
import {
  loadRegistry,
  saveRegistry,
  addWorkspace,
  removeWorkspace,
  switchWorkspace,
  renameWorkspace,
  getActiveCredentials,
  listWorkspaces,
  migrateIfNeeded,
  workspaceDataDir,
  resolveSlug,
  type WorkspaceRegistry,
  type WorkspaceCredentials,
} from "../../src/lib/workspace-registry.js";

function writeJson(path: string, data: unknown) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("migrateIfNeeded", () => {
  test("migrates flat config.json to workspace structure", () => {
    const configPath = join(TEST_DIR, "config.json");
    writeJson(configPath, {
      api_key: "sk-test-123",
      email: "test@example.com",
      workspace_id: "12345",
      workspace_slug: "test_workspace",
      default_format: "text",
    });

    // Create some state files
    writeFileSync(join(TEST_DIR, "file-scan-manifest.json"), "{}");
    writeFileSync(join(TEST_DIR, "recall-state.json"), "{}");

    migrateIfNeeded(TEST_DIR);

    // config.json should now have active_workspace
    const config = readJson(configPath);
    expect(config.active_workspace).toBe("test_workspace");
    expect(config.workspaces.test_workspace).toBeDefined();
    expect(config.api_key).toBeUndefined();
    expect(config.default_format).toBe("text");

    // credentials.json should exist
    const creds = readJson(join(TEST_DIR, "workspaces", "test_workspace", "credentials.json"));
    expect(creds.api_key).toBe("sk-test-123");
    expect(creds.email).toBe("test@example.com");

    // State files should have moved
    expect(existsSync(join(TEST_DIR, "workspaces", "test_workspace", "file-scan-manifest.json"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "file-scan-manifest.json"))).toBe(false);
  });

  test("skips if already migrated", () => {
    const configPath = join(TEST_DIR, "config.json");
    writeJson(configPath, {
      active_workspace: "existing",
      workspaces: { existing: { added_at: 1000 } },
    });

    migrateIfNeeded(TEST_DIR);

    const config = readJson(configPath);
    expect(config.active_workspace).toBe("existing");
  });

  test("migrates ~/.nex-mcp.json as second workspace", () => {
    const configPath = join(TEST_DIR, "config.json");
    writeJson(configPath, {
      api_key: "sk-cli-key",
      email: "user@cli.com",
      workspace_id: "111",
      workspace_slug: "cli_workspace",
    });

    const mcpPath = join(TEST_DIR, "mcp-config.json"); // test stand-in for ~/.nex-mcp.json
    writeJson(mcpPath, {
      api_key: "sk-mcp-key",
      email: "user@mcp.com",
      workspace_id: "222",
      workspace_slug: "mcp_workspace",
    });

    migrateIfNeeded(TEST_DIR, mcpPath);

    const config = readJson(configPath);
    expect(config.active_workspace).toBe("cli_workspace");
    expect(config.workspaces.cli_workspace).toBeDefined();
    expect(config.workspaces.mcp_workspace).toBeDefined();

    // Both should have credentials
    const cliCreds = readJson(join(TEST_DIR, "workspaces", "cli_workspace", "credentials.json"));
    expect(cliCreds.api_key).toBe("sk-cli-key");

    const mcpCreds = readJson(join(TEST_DIR, "workspaces", "mcp_workspace", "credentials.json"));
    expect(mcpCreds.api_key).toBe("sk-mcp-key");
  });
});

describe("loadRegistry", () => {
  test("returns empty registry for missing config", () => {
    const reg = loadRegistry(TEST_DIR);
    expect(reg.active_workspace).toBe("");
    expect(Object.keys(reg.workspaces)).toHaveLength(0);
  });

  test("loads existing registry", () => {
    writeJson(join(TEST_DIR, "config.json"), {
      active_workspace: "ws1",
      workspaces: { ws1: { nickname: "My WS", added_at: 1000 } },
    });

    const reg = loadRegistry(TEST_DIR);
    expect(reg.active_workspace).toBe("ws1");
    expect(reg.workspaces.ws1.nickname).toBe("My WS");
  });
});

describe("addWorkspace", () => {
  test("creates workspace dir and updates registry", () => {
    const creds: WorkspaceCredentials = {
      api_key: "sk-new",
      email: "new@test.com",
      workspace_id: "999",
      workspace_slug: "new_ws",
    };

    addWorkspace("new_ws", creds, "My New WS", TEST_DIR);

    const reg = loadRegistry(TEST_DIR);
    expect(reg.active_workspace).toBe("new_ws");
    expect(reg.workspaces.new_ws.nickname).toBe("My New WS");

    const saved = readJson(join(TEST_DIR, "workspaces", "new_ws", "credentials.json"));
    expect(saved.api_key).toBe("sk-new");
  });

  test("updates credentials for existing workspace", () => {
    const creds1: WorkspaceCredentials = {
      api_key: "sk-old",
      email: "test@test.com",
      workspace_id: "1",
      workspace_slug: "ws",
    };
    addWorkspace("ws", creds1, "Original", TEST_DIR);

    const creds2: WorkspaceCredentials = {
      api_key: "sk-new",
      email: "test@test.com",
      workspace_id: "1",
      workspace_slug: "ws",
    };
    addWorkspace("ws", creds2, undefined, TEST_DIR);

    const saved = readJson(join(TEST_DIR, "workspaces", "ws", "credentials.json"));
    expect(saved.api_key).toBe("sk-new");

    // Nickname should be preserved
    const reg = loadRegistry(TEST_DIR);
    expect(reg.workspaces.ws.nickname).toBe("Original");
  });
});

describe("switchWorkspace", () => {
  test("switches active workspace", () => {
    const creds1: WorkspaceCredentials = {
      api_key: "sk-1", email: "a@test.com", workspace_id: "1", workspace_slug: "ws1",
    };
    const creds2: WorkspaceCredentials = {
      api_key: "sk-2", email: "b@test.com", workspace_id: "2", workspace_slug: "ws2",
    };
    addWorkspace("ws1", creds1, undefined, TEST_DIR);
    addWorkspace("ws2", creds2, undefined, TEST_DIR);

    switchWorkspace("ws2", TEST_DIR);
    const reg = loadRegistry(TEST_DIR);
    expect(reg.active_workspace).toBe("ws2");
  });

  test("throws for unknown slug", () => {
    expect(() => switchWorkspace("nonexistent", TEST_DIR)).toThrow();
  });
});

describe("removeWorkspace", () => {
  test("removes workspace dir and registry entry", () => {
    const creds: WorkspaceCredentials = {
      api_key: "sk-1", email: "a@test.com", workspace_id: "1", workspace_slug: "ws1",
    };
    addWorkspace("ws1", creds, undefined, TEST_DIR);
    removeWorkspace("ws1", TEST_DIR);

    const reg = loadRegistry(TEST_DIR);
    expect(reg.workspaces.ws1).toBeUndefined();
    expect(existsSync(join(TEST_DIR, "workspaces", "ws1"))).toBe(false);
  });
});

describe("renameWorkspace", () => {
  test("updates nickname", () => {
    const creds: WorkspaceCredentials = {
      api_key: "sk-1", email: "a@test.com", workspace_id: "1", workspace_slug: "ws1",
    };
    addWorkspace("ws1", creds, "Old Name", TEST_DIR);
    renameWorkspace("ws1", "New Name", TEST_DIR);

    const reg = loadRegistry(TEST_DIR);
    expect(reg.workspaces.ws1.nickname).toBe("New Name");
  });
});

describe("getActiveCredentials", () => {
  test("returns credentials for active workspace", () => {
    const creds: WorkspaceCredentials = {
      api_key: "sk-active", email: "a@test.com", workspace_id: "1", workspace_slug: "ws1",
    };
    addWorkspace("ws1", creds, undefined, TEST_DIR);

    const active = getActiveCredentials(TEST_DIR);
    expect(active?.api_key).toBe("sk-active");
  });

  test("returns undefined when no workspaces", () => {
    const active = getActiveCredentials(TEST_DIR);
    expect(active).toBeUndefined();
  });
});

describe("listWorkspaces", () => {
  test("returns workspaces sorted by added_at", () => {
    const creds1: WorkspaceCredentials = {
      api_key: "sk-1", email: "a@test.com", workspace_id: "1", workspace_slug: "ws1",
    };
    const creds2: WorkspaceCredentials = {
      api_key: "sk-2", email: "b@test.com", workspace_id: "2", workspace_slug: "ws2",
    };
    addWorkspace("ws1", creds1, "First", TEST_DIR);
    addWorkspace("ws2", creds2, "Second", TEST_DIR);

    const list = listWorkspaces(TEST_DIR);
    expect(list).toHaveLength(2);
    expect(list[0].slug).toBe("ws1");
    expect(list[1].slug).toBe("ws2");
  });
});

describe("resolveSlug", () => {
  test("resolves exact slug", () => {
    const creds: WorkspaceCredentials = {
      api_key: "sk-1", email: "a@test.com", workspace_id: "1", workspace_slug: "ws1",
    };
    addWorkspace("ws1", creds, "My WS", TEST_DIR);
    expect(resolveSlug("ws1", TEST_DIR)).toBe("ws1");
  });

  test("resolves case-insensitive nickname", () => {
    const creds: WorkspaceCredentials = {
      api_key: "sk-1", email: "a@test.com", workspace_id: "1", workspace_slug: "ws1",
    };
    addWorkspace("ws1", creds, "Personal", TEST_DIR);
    expect(resolveSlug("personal", TEST_DIR)).toBe("ws1");
    expect(resolveSlug("PERSONAL", TEST_DIR)).toBe("ws1");
  });

  test("returns null for no match", () => {
    expect(resolveSlug("nonexistent", TEST_DIR)).toBeNull();
  });
});

describe("workspaceDataDir", () => {
  test("returns path for active workspace", () => {
    const creds: WorkspaceCredentials = {
      api_key: "sk-1", email: "a@test.com", workspace_id: "1", workspace_slug: "ws1",
    };
    addWorkspace("ws1", creds, undefined, TEST_DIR);

    const dir = workspaceDataDir(undefined, TEST_DIR);
    expect(dir).toBe(join(TEST_DIR, "workspaces", "ws1"));
  });

  test("returns path for explicit slug", () => {
    const dir = workspaceDataDir("custom", TEST_DIR);
    expect(dir).toBe(join(TEST_DIR, "workspaces", "custom"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && bun test tests/lib/workspace-registry.test.ts`
Expected: FAIL — module not found

### Implementation

- [ ] **Step 3: Implement workspace-registry.ts**

Create `cli/src/lib/workspace-registry.ts`:

```typescript
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
  renameSync, rmSync, readdirSync,
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cli && bun test tests/lib/workspace-registry.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/lib/workspace-registry.ts cli/tests/lib/workspace-registry.test.ts
git commit -m "feat: add workspace registry core with migration support"
```

---

## Task 2: Wire Config to Use Registry

**Update `resolveApiKey()` and `loadConfig()` to resolve credentials from the active workspace.**

**Files:**
- Modify: `cli/src/lib/config.ts`
- Test: `cli/tests/lib/workspace-registry.test.ts` (extend)

- [ ] **Step 1: Add integration test for config resolution**

Append to `cli/tests/lib/workspace-registry.test.ts`:

```typescript
describe("config integration", () => {
  test("resolveApiKey returns active workspace key when no env/flag", () => {
    const creds: WorkspaceCredentials = {
      api_key: "sk-from-workspace", email: "a@test.com", workspace_id: "1", workspace_slug: "ws1",
    };
    addWorkspace("ws1", creds, undefined, TEST_DIR);

    // This tests the registry path; actual config.ts integration is manual
    const active = getActiveCredentials(TEST_DIR);
    expect(active?.api_key).toBe("sk-from-workspace");
  });
});
```

- [ ] **Step 2: Update cli/src/lib/config.ts**

Read the file first. Then modify `resolveApiKey()` (line ~42) to add workspace fallback:

```typescript
import { getActiveCredentials } from "./workspace-registry.js";

export function resolveApiKey(flagValue?: string): string | undefined {
  if (flagValue) return flagValue;
  if (process.env.NEX_API_KEY) return process.env.NEX_API_KEY;

  // Try active workspace credentials
  const wsCreds = getActiveCredentials();
  if (wsCreds?.api_key) return wsCreds.api_key;

  // Legacy fallback: flat config.json (pre-migration)
  return loadConfig().api_key || undefined;
}
```

Update `loadConfig()` (~line 25) to merge active workspace credentials so callers reading `.email`, `.workspace_slug` etc. still work after migration:

```typescript
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
    return {} as NexConfig;
  }
}
```

Update `persistRegistration()` (~line 68) to also add to workspace registry:

```typescript
import { addWorkspace } from "./workspace-registry.js";

export function persistRegistration(data: Record<string, unknown>): void {
  // Legacy: still write to config.json for backwards compat during migration
  const existing = loadConfig();
  const merged = { ...existing, ...data };
  saveConfig(merged);

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
```

- [ ] **Step 3: Run tests**

Run: `cd cli && bun test tests/lib/workspace-registry.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add cli/src/lib/config.ts cli/tests/lib/workspace-registry.test.ts
git commit -m "feat: wire resolveApiKey and persistRegistration to workspace registry"
```

---

## Task 3: Workspace Commands (Non-Interactive)

**Add `nex workspace current`, `nex workspace switch <slug>`, and `nex workspace rename <slug> <name>`.**

**Files:**
- Create: `cli/src/commands/workspace.ts`
- Modify: `cli/src/cli.ts` (register commands)
- Modify: `cli/src/index.ts` (add to INTERACTIVE_COMMANDS)
- Test: `cli/tests/integration/workspace.test.ts`

- [ ] **Step 1: Write integration tests**

Create `cli/tests/integration/workspace.test.ts`:

```typescript
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runNex } from "./helpers.ts";

// Setup a temp ~/.nex dir for testing
const TEST_NEX_DIR = join(import.meta.dir, "../../.test-nex-integration");

function setupWorkspace(slug: string, email: string, apiKey: string) {
  const wsDir = join(TEST_NEX_DIR, "workspaces", slug);
  mkdirSync(wsDir, { recursive: true });
  writeFileSync(join(wsDir, "credentials.json"), JSON.stringify({
    api_key: apiKey, email, workspace_id: "123", workspace_slug: slug,
  }));
}

function setupRegistry(active: string, workspaces: Record<string, { nickname?: string }>) {
  mkdirSync(TEST_NEX_DIR, { recursive: true });
  const reg: Record<string, unknown> = {
    active_workspace: active,
    workspaces: Object.fromEntries(
      Object.entries(workspaces).map(([slug, meta]) => [slug, { ...meta, added_at: Date.now() }])
    ),
  };
  writeFileSync(join(TEST_NEX_DIR, "config.json"), JSON.stringify(reg, null, 2));
}

beforeEach(() => {
  rmSync(TEST_NEX_DIR, { recursive: true, force: true });
});

afterAll(() => {
  rmSync(TEST_NEX_DIR, { recursive: true, force: true });
});

describe("nex workspace current", () => {
  test("shows active workspace info", async () => {
    setupRegistry("ws1", { ws1: { nickname: "Personal" } });
    setupWorkspace("ws1", "test@test.com", "sk-123");

    const { stdout, exitCode } = await runNex(
      ["workspace", "current"],
      { env: { NEX_BASE_DIR: TEST_NEX_DIR } },
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("ws1");
    expect(stdout).toContain("test@test.com");
  }, 15_000);
});

describe("nex workspace switch", () => {
  test("switches to specified workspace", async () => {
    setupRegistry("ws1", { ws1: {}, ws2: { nickname: "Team" } });
    setupWorkspace("ws1", "a@test.com", "sk-1");
    setupWorkspace("ws2", "b@test.com", "sk-2");

    const { exitCode } = await runNex(
      ["workspace", "switch", "ws2"],
      { env: { NEX_BASE_DIR: TEST_NEX_DIR } },
    );
    expect(exitCode).toBe(0);

    const config = JSON.parse(readFileSync(join(TEST_NEX_DIR, "config.json"), "utf-8"));
    expect(config.active_workspace).toBe("ws2");
  }, 15_000);

  test("errors on unknown slug", async () => {
    setupRegistry("ws1", { ws1: {} });
    setupWorkspace("ws1", "a@test.com", "sk-1");

    const { exitCode, stderr } = await runNex(
      ["workspace", "switch", "nonexistent"],
      { env: { NEX_BASE_DIR: TEST_NEX_DIR } },
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("not found");
  }, 15_000);
});

describe("nex workspace rename", () => {
  test("renames workspace nickname", async () => {
    setupRegistry("ws1", { ws1: { nickname: "Old Name" } });
    setupWorkspace("ws1", "a@test.com", "sk-1");

    const { exitCode } = await runNex(
      ["workspace", "rename", "ws1", "New Name"],
      { env: { NEX_BASE_DIR: TEST_NEX_DIR } },
    );
    expect(exitCode).toBe(0);

    const config = JSON.parse(readFileSync(join(TEST_NEX_DIR, "config.json"), "utf-8"));
    expect(config.workspaces.ws1.nickname).toBe("New Name");
  }, 15_000);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && bun test tests/integration/workspace.test.ts`
Expected: FAIL — workspace commands not registered

- [ ] **Step 3: Create workspace.ts commands**

Create `cli/src/commands/workspace.ts`:

```typescript
/**
 * nex workspace — manage local workspaces.
 *
 * Subcommands: list, switch, rename, current.
 */

import { Command } from "commander";
import {
  listWorkspaces,
  switchWorkspace,
  renameWorkspace,
  getActiveCredentials,
  resolveSlug,
  loadRegistry,
  resetDataDirCache,
} from "../lib/workspace-registry.js";
import { style, sym } from "../lib/tui.js";
import { resolveFormat } from "../lib/config.js";

const workspace = new Command("workspace").description("Manage workspaces");

// --- current ---

workspace
  .command("current")
  .description("Show active workspace")
  .action(() => {
    const creds = getActiveCredentials();
    if (!creds) {
      process.stderr.write("No active workspace. Run: nex register --email <email>\n");
      process.exit(1);
    }

    const registry = loadRegistry();
    const meta = registry.workspaces[creds.workspace_slug];
    const nickname = meta?.nickname;

    const format = resolveFormat();
    if (format === "json") {
      console.log(JSON.stringify({
        slug: creds.workspace_slug,
        nickname: nickname || null,
        email: creds.email,
        workspace_id: creds.workspace_id,
        active: true,
      }));
    } else {
      const display = nickname
        ? `${style.bold(nickname)} (${style.dim(creds.workspace_slug)})`
        : style.bold(creds.workspace_slug);
      console.log(`${sym.success} Active: ${display}`);
      console.log(`  Email: ${creds.email}`);
      console.log(`  ID:    ${creds.workspace_id}`);
    }
  });

// --- switch ---

workspace
  .command("switch")
  .description("Switch active workspace")
  .argument("[slug-or-nickname]", "Workspace slug or nickname")
  .action(async (input?: string) => {
    if (!input) {
      // Interactive mode — launch picker
      await interactiveWorkspacePicker();
      return;
    }

    const slug = resolveSlug(input);
    if (!slug) {
      process.stderr.write(`Workspace "${input}" not found.\n`);
      process.exit(1);
    }

    const creds = switchWorkspace(slug);
    resetDataDirCache();
    console.log(`${sym.success} Switched to ${style.bold(slug)} (${creds.email})`);
  });

// --- rename ---

workspace
  .command("rename")
  .description("Rename a workspace")
  .argument("<slug-or-nickname>", "Workspace slug or nickname")
  .argument("<name>", "New nickname")
  .action((input: string, name: string) => {
    const slug = resolveSlug(input);
    if (!slug) {
      process.stderr.write(`Workspace "${input}" not found.\n`);
      process.exit(1);
    }

    renameWorkspace(slug, name);
    console.log(`${sym.success} Renamed ${style.bold(slug)} to "${name}"`);
  });

// --- list ---

workspace
  .command("list")
  .description("Interactive workspace manager")
  .action(async () => {
    if (!process.stdin.isTTY) {
      // Non-TTY: print JSON list
      const workspaces = listWorkspaces();
      const registry = loadRegistry();
      const output = workspaces.map((ws) => ({
        slug: ws.slug,
        nickname: ws.nickname || null,
        email: ws.email,
        active: ws.slug === registry.active_workspace,
      }));
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    await interactiveWorkspacePicker();
  });

export { workspace };

// --- Interactive picker (placeholder — implemented in Task 4) ---

async function interactiveWorkspacePicker(): Promise<void> {
  // TODO: Task 4 implements the full interactive picker
  const workspaces = listWorkspaces();
  const registry = loadRegistry();

  if (workspaces.length === 0) {
    console.log("No workspaces registered. Run: nex register --email <email>");
    return;
  }

  for (const ws of workspaces) {
    const active = ws.slug === registry.active_workspace ? `${style.green("●")} ` : "  ";
    const display = ws.nickname
      ? `${style.bold(ws.nickname)} (${style.dim(ws.slug)})`
      : style.bold(ws.slug);
    console.log(`${active}${display}`);
    console.log(`  ${style.dim(ws.email)}`);
  }
}
```

- [ ] **Step 4: Register command in cli.ts and index.ts**

In `cli/src/cli.ts`, add after existing command registrations:

```typescript
import { workspace } from "./commands/workspace.js";
program.addCommand(workspace);
```

In `cli/src/index.ts`, add `"workspace"` to the `INTERACTIVE_COMMANDS` set (line 107):

```typescript
const INTERACTIVE_COMMANDS = new Set(["setup", "integrate", "scan", "register", "status", "workspace"]);
```

- [ ] **Step 5: Run integration tests**

Run: `cd cli && bun test tests/integration/workspace.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add cli/src/commands/workspace.ts cli/src/cli.ts cli/src/index.ts cli/tests/integration/workspace.test.ts
git commit -m "feat: add workspace current, switch, rename commands"
```

---

## Task 4: Interactive Workspace Picker

**Raw stdin picker with ↑↓ navigation, enter to switch, r to rename, d to delete.**

**Files:**
- Modify: `cli/src/commands/workspace.ts` (replace placeholder `interactiveWorkspacePicker`)

- [ ] **Step 1: Replace `interactiveWorkspacePicker` with full implementation**

Replace the placeholder function in `cli/src/commands/workspace.ts`:

```typescript
async function interactiveWorkspacePicker(): Promise<void> {
  const registry = loadRegistry();
  let workspaces = listWorkspaces();

  if (workspaces.length === 0) {
    console.log("No workspaces registered. Run: nex register --email <email>");
    return;
  }

  let selected = 0;
  let mode: "normal" | "renaming" | "confirming-delete" = "normal";
  let renameBuffer = "";
  let errorMessage = "";

  function draw() {
    // Clear screen + move cursor home
    process.stdout.write("\x1b[2J\x1b[H");

    process.stdout.write(`  ${style.bold("Workspaces")}${style.dim("  (q to exit)")}\n`);
    process.stdout.write(`  ${"─".repeat(45)}\n\n`);

    for (let i = 0; i < workspaces.length; i++) {
      const ws = workspaces[i];
      const isActive = ws.slug === registry.active_workspace;
      const isSelected = i === selected;
      const indicator = isActive ? style.green("●") : " ";
      const pointer = isSelected ? style.cyan(sym.pointer) : " ";

      const display = ws.nickname
        ? `${style.bold(ws.nickname)} ${style.dim(`(${ws.slug})`)}`
        : style.bold(ws.slug);

      process.stdout.write(`  ${pointer} ${indicator} ${display}\n`);
      process.stdout.write(`      ${style.dim(ws.email)}\n`);

      // Inline rename input
      if (isSelected && mode === "renaming") {
        process.stdout.write(`      ${style.cyan("Nickname:")} ${renameBuffer}█\n`);
      }

      // Inline delete confirmation
      if (isSelected && mode === "confirming-delete") {
        const name = ws.nickname || ws.slug;
        process.stdout.write(`      ${style.red(`Remove ${name}? (y/n)`)}\n`);
      }

      process.stdout.write("\n");
    }

    if (errorMessage) {
      process.stdout.write(`  ${style.red(errorMessage)}\n\n`);
      errorMessage = "";
    }

    if (mode === "normal") {
      process.stdout.write(
        `  ${style.dim("[↑↓] navigate  [enter] switch  [r] rename  [d] delete")}\n`
      );
    } else if (mode === "renaming") {
      process.stdout.write(`  ${style.dim("[enter] save  [esc] cancel")}\n`);
    }
  }

  function cleanup() {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdin.removeAllListeners("data");
    // Clear screen
    process.stdout.write("\x1b[2J\x1b[H");
  }

  return new Promise<void>((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf-8");

    draw();

    process.stdin.on("data", (key: string) => {
      if (mode === "normal") {
        // Navigation
        if (key === "\x1b[A" && selected > 0) {
          selected--;
        } else if (key === "\x1b[B" && selected < workspaces.length - 1) {
          selected++;
        }

        // Switch (enter)
        else if (key === "\r") {
          const ws = workspaces[selected];
          if (ws.slug !== registry.active_workspace) {
            switchWorkspace(ws.slug);
            resetDataDirCache();
            registry.active_workspace = ws.slug;
          }
          cleanup();
          const display = ws.nickname || ws.slug;
          console.log(`${sym.success} Switched to ${style.bold(display)}`);
          resolve();
          return;
        }

        // Rename (r)
        else if (key === "r") {
          mode = "renaming";
          renameBuffer = workspaces[selected].nickname || "";
        }

        // Delete (d)
        else if (key === "d") {
          const ws = workspaces[selected];
          if (ws.slug === registry.active_workspace) {
            errorMessage = "Cannot remove active workspace. Switch first.";
          } else {
            mode = "confirming-delete";
          }
        }

        // Quit
        else if (key === "q" || key === "\x03") {
          cleanup();
          resolve();
          return;
        }
      }

      else if (mode === "renaming") {
        if (key === "\r") {
          // Commit rename
          const ws = workspaces[selected];
          renameWorkspace(ws.slug, renameBuffer);
          ws.nickname = renameBuffer;
          mode = "normal";
          renameBuffer = "";
        } else if (key === "\x1b") {
          // Cancel
          mode = "normal";
          renameBuffer = "";
        } else if (key === "\x7f") {
          // Backspace
          renameBuffer = renameBuffer.slice(0, -1);
        } else if (key.length === 1 && key >= " ") {
          renameBuffer += key;
        }
      }

      else if (mode === "confirming-delete") {
        if (key === "y") {
          const ws = workspaces[selected];
          removeWorkspace(ws.slug);
          workspaces = listWorkspaces();
          if (selected >= workspaces.length) selected = Math.max(0, workspaces.length - 1);
          mode = "normal";

          if (workspaces.length === 0) {
            cleanup();
            console.log("All workspaces removed.");
            resolve();
            return;
          }
        } else {
          mode = "normal";
        }
      }

      draw();
    });
  });
}
```

Also add the missing import at top of file:

```typescript
import { removeWorkspace } from "../lib/workspace-registry.js";
```

- [ ] **Step 2: Manual test**

Run: `cd cli && bun src/index.ts workspace list`
Expected: Interactive picker renders with ↑↓ navigation, enter switches, r renames, d deletes, q quits.

- [ ] **Step 3: Commit**

```bash
git add cli/src/commands/workspace.ts
git commit -m "feat: add interactive workspace picker with rename/delete"
```

---

## Task 5: Update Plugin State File Paths

**Make `file-manifest.ts`, `rate-limiter.ts`, and `recall-filter.ts` workspace-aware across all 3 packages.**

**Files:**
- Create: `claude-code-plugin/src/workspace-data-dir.ts`
- Create: `mcp/src/workspace-data-dir.ts`
- Modify: `claude-code-plugin/src/file-manifest.ts`
- Modify: `claude-code-plugin/src/session-store.ts`
- Modify: `claude-code-plugin/src/rate-limiter.ts`
- Modify: `claude-code-plugin/src/recall-filter.ts`
- Modify: `mcp/src/file-manifest.ts`
- Modify: `mcp/src/session-store.ts`
- Modify: `mcp/src/rate-limiter.ts`

- [ ] **Step 1: Update claude-code-plugin/src/file-manifest.ts**

Replace the hardcoded path constants with a lazy resolver. Read the file first to get exact current code.

Change the `DATA_DIR` and `MANIFEST_PATH` constants (lines 24-26) to:

```typescript
import { workspaceDataDir } from "./workspace-data-dir.js";

function dataDir(): string {
  return workspaceDataDir();
}

function manifestPath(): string {
  return join(dataDir(), "file-scan-manifest.json");
}
```

Update all references from `MANIFEST_PATH` to `manifestPath()` and `DATA_DIR` to `dataDir()`.

**But first** — we need a shared `workspaceDataDir` function in the plugin. Create `claude-code-plugin/src/workspace-data-dir.ts`:

```typescript
/**
 * Resolve the active workspace's data directory.
 * Reads from ~/.nex/config.json (workspace registry format).
 * Falls back to ~/.nex/ if no workspace is configured (pre-migration).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const BASE_DIR = join(homedir(), ".nex");

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
  } catch {
    // No config or parse error — fall back
  }

  return BASE_DIR; // Pre-migration fallback
}

export function resetWorkspaceCache(): void {
  _cached = undefined;
}
```

- [ ] **Step 2: Apply same pattern to rate-limiter.ts and recall-filter.ts**

For `claude-code-plugin/src/rate-limiter.ts`: Replace hardcoded `STATE_PATH` with:
```typescript
import { workspaceDataDir } from "./workspace-data-dir.js";
// In canProceed() and other methods, use:
const statePath = join(workspaceDataDir(), "rate-limiter.json");
```

For `claude-code-plugin/src/recall-filter.ts`: Replace hardcoded `DATA_DIR`/`STATE_FILE` with lazy functions using `workspaceDataDir()`.

- [ ] **Step 2b: Update session-store.ts files**

For `claude-code-plugin/src/session-store.ts`: The constructor already accepts `dataDir`. Find where `SessionStore` is instantiated (in `auto-session-start.ts`, `auto-recall.ts`, `shared.ts`) and pass `workspaceDataDir()` as the data dir option.

For `mcp/src/session-store.ts`: Same — find instantiation sites and pass `workspaceDataDir()`.

- [ ] **Step 3: Copy the same pattern to MCP package**

Create `mcp/src/workspace-data-dir.ts` (identical to claude-code-plugin version).

Update `mcp/src/file-manifest.ts`, `mcp/src/session-store.ts`, and `mcp/src/rate-limiter.ts` the same way.

- [ ] **Step 4: Build all packages to verify compilation**

Run: `cd claude-code-plugin && npm run build`
Run: `cd mcp && bun install && bun run build` (if deps available)

Expected: Clean compilation

- [ ] **Step 5: Commit**

```bash
git add claude-code-plugin/src/workspace-data-dir.ts claude-code-plugin/src/file-manifest.ts \
  claude-code-plugin/src/rate-limiter.ts claude-code-plugin/src/recall-filter.ts \
  mcp/src/workspace-data-dir.ts mcp/src/file-manifest.ts mcp/src/rate-limiter.ts
git commit -m "feat: make state file paths workspace-aware across plugins"
```

---

## Task 6: Update Plugin Config to Use Workspace Credentials

**Make `claude-code-plugin/src/config.ts` and `mcp/src/config.ts` read from the active workspace instead of legacy paths.**

**Files:**
- Modify: `claude-code-plugin/src/config.ts`
- Modify: `claude-code-plugin/src/auto-register.ts`
- Modify: `mcp/src/config.ts`

- [ ] **Step 1: Update claude-code-plugin/src/config.ts**

Read the file first. Replace `loadMcpConfig()` (which reads `~/.nex-mcp.json`) with workspace-aware loading:

```typescript
import { workspaceDataDir } from "./workspace-data-dir.js";

function loadWorkspaceCredentials(): { api_key?: string; [key: string]: unknown } {
  try {
    const credPath = join(workspaceDataDir(), "credentials.json");
    return JSON.parse(readFileSync(credPath, "utf-8"));
  } catch {
    return {};
  }
}
```

Update `loadConfig()` to use `loadWorkspaceCredentials()` as primary source, with env var override:

```typescript
export function loadConfig(): NexPluginConfig {
  const envKey = process.env.NEX_API_KEY;
  if (envKey) {
    return { apiKey: envKey, baseUrl: resolveBaseUrl() };
  }

  const creds = loadWorkspaceCredentials();
  if (creds.api_key) {
    return { apiKey: creds.api_key as string, baseUrl: resolveBaseUrl() };
  }

  // Legacy fallback: ~/.nex-mcp.json (for users who haven't migrated)
  const legacy = loadLegacyMcpConfig();
  if (legacy.api_key) {
    return { apiKey: legacy.api_key as string, baseUrl: resolveBaseUrl() };
  }

  throw new ConfigError("No API key configured");
}
```

- [ ] **Step 2: Update claude-code-plugin/src/auto-register.ts**

Replace `persistRegistration()` call with workspace-aware registration. Read the file first, then update the success handler to write to `~/.nex/workspaces/<slug>/credentials.json` via a shared helper.

- [ ] **Step 3: Update mcp/src/config.ts**

Same pattern — read credentials from `workspaceDataDir()/credentials.json`, with env var override and legacy fallback.

- [ ] **Step 4: Build to verify**

Run: `cd claude-code-plugin && npm run build`
Expected: Clean compilation

- [ ] **Step 5: Commit**

```bash
git add claude-code-plugin/src/config.ts claude-code-plugin/src/auto-register.ts mcp/src/config.ts
git commit -m "feat: plugin configs read credentials from active workspace"
```

---

## Task 7: Auto-Register on Setup and Register

**Ensure `nex register` and `nex setup` add workspaces to the registry automatically.**

**Files:**
- Modify: `cli/src/commands/register.ts`
- Modify: `cli/src/commands/setup.ts`

- [ ] **Step 1: Verify register.ts already works**

Since we updated `persistRegistration()` in Task 2 to call `addWorkspace()`, `nex register` should already auto-register. Verify by reading `cli/src/commands/register.ts` — if it calls `persistRegistration(data)` with `workspace_slug` in `data`, it's covered.

- [ ] **Step 2: Verify setup.ts already works**

Same check — `cli/src/commands/setup.ts` calls `persistRegistration()` at lines 232, 282, 305. All three paths should now auto-register via the updated `persistRegistration()`.

- [ ] **Step 3: Add integration test for auto-registration**

Append to `cli/tests/integration/workspace.test.ts`:

```typescript
// Note: This test verifies the data flow, not the full register command
// (which requires network). The unit test in workspace-registry.test.ts
// covers the addWorkspace logic directly.
```

- [ ] **Step 4: No commit needed — this task is verification only**

If `persistRegistration()` was correctly updated in Task 2 and both `register.ts` and `setup.ts` call it, auto-registration is already wired. No code changes needed here.

---

## Task 8: Sync Plugin Source and Final Build

**Sync claude-code-plugin into cli/src/plugin/, build everything, run full test suite.**

**Files:**
- Sync: `claude-code-plugin/src/` → `cli/src/plugin/`
- Sync: `claude-code-plugin/commands/` → `cli/plugin-commands/`

- [ ] **Step 1: Sync plugin source**

**IMPORTANT: Do NOT use `--delete` — the CLI plugin has files that don't exist in claude-code-plugin (shared.ts, etc.).**

```bash
cd /Users/najmuzzaman/.superset/projects/nex-as-a-skill
rsync -a claude-code-plugin/src/ cli/src/plugin/
rsync -a claude-code-plugin/commands/ cli/plugin-commands/
```

- [ ] **Step 2: Build claude-code-plugin**

```bash
cd claude-code-plugin && npm run build
```
Expected: Clean compilation

- [ ] **Step 3: Build CLI**

```bash
cd cli && bun install && bun run build
```
Expected: Clean compilation

- [ ] **Step 4: Run full test suite**

```bash
cd cli && bun test tests/lib tests/integration
```
Expected: All tests PASS

- [ ] **Step 5: Commit synced files**

```bash
git add cli/src/plugin/ cli/plugin-commands/
git commit -m "chore: sync plugin source into CLI"
```

---

## Task 9: Branch, PR, and Publish

**Create feature branch, push, create PR, publish new version.**

- [ ] **Step 1: Create branch and push**

```bash
git checkout -b feat/workspace-management
git push -u origin feat/workspace-management
```

- [ ] **Step 2: Create PR**

```bash
gh pr create --title "feat: add workspace management (list, switch, rename, delete)" --body "$(cat <<'EOF'
## Summary
- New `nex workspace` command: list, switch, rename, current
- Per-workspace state isolation (~/.nex/workspaces/<slug>/)
- Migration from flat config.json + legacy ~/.nex-mcp.json
- Interactive picker with ↑↓, enter, r(ename), d(elete)
- Auto-register workspaces on `nex register` and `nex setup`
- Plugin configs (claude-code, MCP) read from active workspace

## Test plan
- [ ] Unit tests: workspace registry operations + migration
- [ ] Integration tests: workspace commands via subprocess
- [ ] Manual: register two workspaces, switch, rename, delete
- [ ] Manual: Claude Code session uses correct workspace credentials after switch

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Merge and publish**

After CI passes:
```bash
gh pr merge --squash
git checkout main && git pull
cd cli && npm version patch --no-git-tag-version && bun run build
NODE_AUTH_TOKEN=<token> npm publish --access public
```
