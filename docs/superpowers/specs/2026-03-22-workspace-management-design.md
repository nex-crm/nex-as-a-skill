# Workspace Management — Design Spec

**Date:** 2026-03-22
**Status:** Draft
**Scope:** `nex workspace` CLI command + storage migration + auto-registration

---

## Problem

Users with multiple Nex workspaces (e.g., personal + team) on the same machine must re-run `nex setup` with a different email to switch. This overwrites the current config, losing the previous workspace's credentials and state. There's no way to list, switch between, or label workspaces.

## Solution

Add `nex workspace` subcommands backed by per-workspace isolated storage. Migrate from the current flat `~/.nex/config.json` to a workspace-aware directory structure. Auto-register workspaces during `nex register` and `nex setup`.

---

## Architecture

### Storage Layout

```
~/.nex/
  config.json                          # Global config: active_workspace pointer + settings
  workspaces/
    <slug>/                            # One directory per workspace
      credentials.json                 # api_key, email, workspace_id, workspace_slug
      file-scan-manifest.json          # Scan state (shared across plugin contexts)
      claude-sessions.json             # Claude Code plugin session mappings
      mcp-sessions.json                # MCP server session mappings
      cli-sessions.json                # CLI session mappings
      recall-state.json                # Recall debounce state
      rate-limiter.json                # API rate limiter state (shared)
```

**Note:** `file-scan-manifest.json`, `rate-limiter.json`, and `recall-state.json` are intentionally shared across plugin contexts (claude-code-plugin, cli plugin, mcp) within the same workspace — they track the same workspace's API quota and ingested files. Session files are per-plugin because each plugin tracks its own session mappings.

### `config.json` (new format)

```json
{
  "active_workspace": "cli_nazz_f96292",
  "workspaces": {
    "cli_nazz_f96292": {
      "nickname": "personal",
      "added_at": 1711100000000
    },
    "cli_team_nex_ai": {
      "nickname": "Nex AI Team",
      "added_at": 1711200000000
    }
  },
  "default_format": "text",
  "default_timeout": 120000
}
```

- `active_workspace` — slug of the currently active workspace
- `workspaces` — registry of all known workspaces with local metadata (nickname, timestamp)
- Global settings (`default_format`, `default_timeout`) remain at the top level
- Credentials move out of `config.json` into `workspaces/<slug>/credentials.json`

### `credentials.json` (per workspace)

```json
{
  "api_key": "sk-...",
  "email": "nazz@gmail.com",
  "workspace_id": "62866327953583100",
  "workspace_slug": "cli_nazz_f96292"
}
```

---

## Migration

Migration runs once, triggered explicitly by `loadRegistry()`. It is idempotent — if `config.json` already has `active_workspace`, migration is skipped.

**Important:** `loadRegistry()` must NOT be called at module import time. It is called lazily by `resolveApiKey()`, `getActiveCredentials()`, and workspace commands. This avoids triggering file system writes as a side effect of module imports (the current `loadConfig()` is called at import time for `BASE_URL` — that call remains unchanged and does not go through the registry).

### Step 1: Detect migration trigger

If `~/.nex/config.json` contains `api_key` at the top level → migrate.

### Step 2: Migrate `~/.nex/config.json`

1. Read existing `api_key`, `email`, `workspace_id`, `workspace_slug` from `config.json`
2. Create `~/.nex/workspaces/<workspace_slug>/credentials.json` with those fields
3. Move existing state files into `~/.nex/workspaces/<workspace_slug>/`:
   - `file-scan-manifest.json`
   - `claude-sessions.json`, `mcp-sessions.json`, `cli-sessions.json` (whichever exist)
   - `recall-state.json`
   - `rate-limiter.json`
4. Rewrite `config.json` to the new format with `active_workspace` set to the migrated slug
5. Preserve global settings (`default_format`, `default_timeout`, `llm_provider`, `dev_url`, `gemini_api_key`, etc.) at the top level

### Step 3: Migrate `~/.nex-mcp.json` (legacy plugin config)

The `claude-code-plugin` and `cli/src/plugin` packages read credentials from `~/.nex-mcp.json`. This file may contain a different API key than `~/.nex/config.json` if the user registered via the plugin's `/register` slash command.

1. If `~/.nex-mcp.json` exists and contains an `api_key`:
   - If its `workspace_slug` matches an already-migrated workspace → update credentials if the `api_key` is newer (higher `ingestedAt` or just overwrite — the most recent registration is authoritative)
   - If its `workspace_slug` is different → add as a second workspace entry
2. After migration, delete `~/.nex-mcp.json` (or rename to `~/.nex-mcp.json.bak` for safety)
3. Update `auto-register.ts` (both copies) to persist via `addWorkspace()` instead of writing to `~/.nex-mcp.json`

---

## Components

### 1. Workspace Registry (`cli/src/lib/workspace-registry.ts`)

Core data layer. No UI, no side effects beyond file I/O.

```typescript
interface WorkspaceEntry {
  slug: string;
  nickname?: string;
  added_at: number;
}

interface WorkspaceCredentials {
  api_key: string;
  email: string;
  workspace_id: string;
  workspace_slug: string;
}

interface WorkspaceRegistry {
  active_workspace: string;
  workspaces: Record<string, { nickname?: string; added_at: number }>;
}
```

**Functions:**

| Function | Purpose |
|----------|---------|
| `loadRegistry(): WorkspaceRegistry` | Load config.json, run migration if needed |
| `saveRegistry(registry)` | Write config.json |
| `addWorkspace(slug, credentials, nickname?)` | Create workspace dir + credentials, add to registry |
| `removeWorkspace(slug)` | Remove workspace dir and registry entry |
| `switchWorkspace(slug)` | Set `active_workspace`, return credentials |
| `renameWorkspace(slug, nickname)` | Update nickname in registry |
| `getActiveCredentials(): WorkspaceCredentials` | Load credentials for active workspace |
| `listWorkspaces(): WorkspaceEntry[]` | Return all workspaces sorted by added_at |
| `migrateIfNeeded()` | One-time migration from flat config |

### 2. Config Integration

`resolveApiKey()` in `cli/src/lib/config.ts` changes to:

```
Priority: CLI flag → NEX_API_KEY env var → active workspace credentials → undefined
```

`loadConfig()` returns the active workspace's credentials merged with global settings. All existing callers work unchanged.

### 3. Plugin Config Integration

`claude-code-plugin/src/config.ts` and `cli/src/plugin/config.ts` currently read from `~/.nex-mcp.json` and `~/.nex/config.json`. Updated to:

```
Priority: NEX_API_KEY env var → active workspace credentials (via registry) → legacy fallback
```

State file paths (`readManifest`, `SessionStore`, `RateLimiter`, `RecallFilter`) updated to resolve from `~/.nex/workspaces/<active_slug>/` instead of `~/.nex/`.

### 4. Workspace Picker (`cli/src/commands/workspace.ts`)

Interactive UI using the raw stdin pattern from `nex integrate list`. Not an Ink/React component — direct ANSI rendering with raw mode input for maximum control.

**Render:**

```
  Workspaces                                       (q to exit)
  ─────────────────────────────────────────────────

  ● personal (cli_nazz_f96292)
    nazz@gmail.com

    Nex AI Team (cli_team_nex_ai)
    najmuzzaman@nex.ai

  [↑↓] navigate  [enter] switch  [r] rename  [d] delete
```

**State machine:**

```
normal → (enter) → switch workspace, exit
normal → (r) → renaming mode (inline text input replaces nickname)
normal → (d) → confirming-delete mode ("Remove <name>? y/n")
normal → (q / Ctrl+C) → exit
renaming → (enter) → commit rename, back to normal
renaming → (esc) → cancel, back to normal
confirming-delete → (y) → remove workspace, back to normal
confirming-delete → (n / esc) → cancel, back to normal
```

**Active workspace indicator:** `●` (green) for active, blank for inactive.

**Delete guard:** Cannot delete the active workspace. Show error inline: "Cannot remove active workspace. Switch first."

### 5. Commander Registration

```typescript
program
  .command("workspace")
  .description("Manage workspaces")
  .addCommand(
    new Command("list").description("Interactive workspace manager").action(workspaceList)
  )
  .addCommand(
    new Command("switch")
      .description("Switch active workspace")
      .argument("[slug]", "Workspace slug or nickname")
      .action(workspaceSwitch)
  )
  .addCommand(
    new Command("rename")
      .description("Rename a workspace")
      .argument("<slug>", "Workspace slug or nickname")
      .argument("<name>", "New nickname")
      .action(workspaceRename)
  )
  .addCommand(
    new Command("current").description("Show active workspace").action(workspaceCurrent)
  );
```

`workspace` added to `INTERACTIVE_COMMANDS` set in `cli/src/index.ts`.

### 6. Auto-Registration

**`nex register`:** After successful registration, call `addWorkspace(slug, credentials)`. If workspace already exists (re-registration), update credentials only.

**`nex setup`:** Same — after registration or re-authentication step, call `addWorkspace()`. If the user is re-authenticating an existing workspace, update credentials in place.

---

## Command Behaviors

### `nex workspace list`

- Interactive picker (raw stdin, full-screen)
- Shows all workspaces with nickname, slug, email, active indicator
- Keybindings: navigate, switch, rename, delete
- Non-TTY fallback: print plain list and exit

### `nex workspace switch [slug]`

- With argument: switch immediately, print confirmation
- Without argument: launch interactive picker (same as `workspace list` but enter switches)
- Accepts slug or nickname. Resolution order: exact slug match → exact nickname match (case-insensitive) → error. No fuzzy matching — ambiguity is worse than requiring the user to be specific.

### `nex workspace rename <slug> <name>`

- Direct rename, no interactive UI
- Accepts slug or nickname for the first argument
- Print confirmation

### `nex workspace current`

- Print: nickname, slug, email, workspace_id
- Non-interactive, suitable for scripts

---

## State File Resolution

All state file readers/writers need a workspace-aware path resolver:

```typescript
// Cached at module level after first resolution — avoids re-reading config.json on every call.
let _cachedDataDir: string | undefined;

export function workspaceDataDir(slug?: string): string {
  if (slug) {
    return join(homedir(), ".nex", "workspaces", slug);
  }
  if (!_cachedDataDir) {
    const registry = loadRegistry();
    _cachedDataDir = join(homedir(), ".nex", "workspaces", registry.active_workspace);
  }
  return _cachedDataDir;
}
```

The active workspace slug is cached after first resolution. This is safe because a process (hook or CLI command) never switches workspaces mid-execution.

**Refactoring state modules:**

`session-store.ts` and `rate-limiter.ts` already accept a `dataDir` option in their constructors — pass `workspaceDataDir()`.

`file-manifest.ts` and `recall-filter.ts` use module-level `const` paths. Refactor to lazy functions:

```typescript
// Before:
const MANIFEST_PATH = join(DATA_DIR, "file-scan-manifest.json");

// After:
function manifestPath(): string {
  return join(workspaceDataDir(), "file-scan-manifest.json");
}
```

Affected modules (in all 3 packages):
- `file-manifest.ts` — `MANIFEST_PATH` → `manifestPath()`
- `session-store.ts` — pass `workspaceDataDir()` to constructor
- `rate-limiter.ts` — pass `workspaceDataDir()` to constructor
- `recall-filter.ts` — `STATE_PATH` → lazy function

---

## Edge Cases

1. **No workspaces registered:** `loadRegistry()` returns empty. `getActiveCredentials()` returns undefined. Same behavior as current "no API key" path — hooks show registration prompt.

2. **Active workspace deleted externally:** If `active_workspace` points to a missing directory, fall back to first available workspace or undefined.

3. **Legacy installs:** Migration handles the transition. Users who never registered have an empty config and see the registration prompt as before.

4. **Concurrent hook access:** Multiple hooks may read state files simultaneously. File writes are atomic (write-to-temp + rename) in the manifest module already.

5. **Nickname collisions:** Allowed — nicknames are display-only labels, not identifiers. Slug is the canonical key.

6. **Removing the last workspace:** Allowed. Leaves the user with zero workspaces and no credentials. `getActiveCredentials()` returns undefined, hooks show registration prompt. Same UX as a fresh install.

7. **Non-TTY output for `workspace list`:** Uses `resolveFormat()` like other commands. Default non-TTY format is JSON. Example: `[{"slug":"cli_nazz_f96292","nickname":"personal","email":"nazz@gmail.com","active":true}]`

---

## Testing

### Unit Tests (`cli/tests/lib/workspace-registry.test.ts`)

- Migration from flat config → workspace structure
- Add/remove/switch/rename workspace operations
- `getActiveCredentials()` resolves correctly
- Edge cases: missing dirs, empty registry, re-registration

### Integration Tests (`cli/tests/integration/workspace.test.ts`)

- `nex workspace current` outputs active workspace info
- `nex workspace switch <slug>` changes active workspace
- `nex workspace rename <slug> <name>` updates nickname
- Unknown slug exits with error

### Manual Test Plan

1. Fresh install → `nex register` → verify workspace created in `~/.nex/workspaces/`
2. Register second workspace with different email → verify both in `nex workspace list`
3. Switch between workspaces → verify `nex workspace current` changes
4. Rename workspace → verify picker shows new nickname
5. Delete non-active workspace → verify removal
6. Try deleting active workspace → verify error
7. Start Claude Code session → verify hooks use active workspace's credentials and state

---

## Files Changed

### New Files
- `cli/src/lib/workspace-registry.ts` — Registry data layer
- `cli/src/commands/workspace.ts` — Commander commands + interactive picker
- `cli/tests/lib/workspace-registry.test.ts` — Unit tests
- `cli/tests/integration/workspace.test.ts` — Integration tests

### Modified Files

**CLI core:**
- `cli/src/lib/config.ts` — `resolveApiKey()` uses registry; `loadConfig()` merges active credentials with global settings. `BASE_URL` resolution unchanged (stays at import time, no registry call).
- `cli/src/index.ts` — Add `workspace` to `INTERACTIVE_COMMANDS`
- `cli/src/commands/register.ts` — Auto-add to registry after registration
- `cli/src/commands/setup.ts` — Auto-add to registry after setup

**claude-code-plugin (5 files):**
- `claude-code-plugin/src/config.ts` — Workspace-aware credential loading, remove `~/.nex-mcp.json` reads
- `claude-code-plugin/src/auto-register.ts` — Persist via `addWorkspace()` instead of `~/.nex-mcp.json`
- `claude-code-plugin/src/file-manifest.ts` — Workspace-aware paths (lazy function)
- `claude-code-plugin/src/session-store.ts` — Pass `workspaceDataDir()` to constructor
- `claude-code-plugin/src/rate-limiter.ts` — Pass `workspaceDataDir()` to constructor
- `claude-code-plugin/src/recall-filter.ts` — Workspace-aware paths (lazy function)

**cli/src/plugin (synced copy of claude-code-plugin — same changes):**
- `cli/src/plugin/config.ts`
- `cli/src/plugin/auto-register.ts`
- `cli/src/plugin/file-manifest.ts`
- `cli/src/plugin/session-store.ts`
- `cli/src/plugin/rate-limiter.ts`
- `cli/src/plugin/recall-filter.ts`

**MCP server (4 files):**
- `mcp/src/config.ts` — Workspace-aware credential loading
- `mcp/src/file-manifest.ts` — Workspace-aware paths
- `mcp/src/session-store.ts` — Workspace-aware paths
- `mcp/src/rate-limiter.ts` — Workspace-aware paths

**Unaffected:**
- `openclaw-plugin/` — Uses in-memory state and receives API key via plugin config injection, not file system. No changes needed.

---

## Non-Goals

- Server-side workspace management (create/delete workspaces via API)
- Multi-workspace concurrent access (only one active at a time)
- Workspace-specific `.nex.toml` overrides (project config stays project-level)
- Team member invite flow (separate feature)
