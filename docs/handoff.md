# Nex Plugins — Session Handoff

> Last updated: 2026-03-09

## First Steps

1. Read this file fully
2. Check CLI builds: `cd /Users/najmuzzaman/Documents/nex/nex-as-a-skill/cli && npm run build`
3. Review uncommitted changes: `cd /Users/najmuzzaman/Documents/nex/nex-as-a-skill && git diff --stat`

## What Was Done This Session

### 1. Platform Rules/Instructions (P0 — COMPLETE)

Created 9 platform-specific rules/instruction template files in `cli/platform-rules/`:
- `cursor-rules.md` → `.cursor/rules/nex.md`
- `windsurf-rules.md` → `.windsurf/rules/nex.md`
- `vscode-instructions.md` → `.github/instructions/nex.instructions.md` (has YAML frontmatter)
- `cline-rules.md` → `.clinerules/nex.md`
- `continue-rules.md` → `.continue/rules/nex.md`
- `zed-rules.md` → `.rules` (append with markers)
- `kilocode-rules.md` → `.kilocode/rules/nex.md`
- `opencode-agents.md` → `AGENTS.md` (append with markers)
- `aider-conventions.md` → `CONVENTIONS.md` (append with markers)

Each file teaches the AI agent about Nex MCP tools (ask, remember, search, integrations).

### 2. Setup Hierarchy (plugins > rules > MCP)

Updated `nex setup` to use a clear hierarchy:
- **Claude Code**: Plugin (hooks + slash commands) — no MCP needed
- **Claude Desktop**: MCP only (no rules system)
- **All others**: Rules (instruction files) + MCP (tools) — complementary

Files changed:
- `cli/src/lib/platform-detect.ts` — Added `supportsRules`, `rulesPath` fields to Platform interface
- `cli/src/lib/installers.ts` — Added `installRulesFile()` with standalone and append modes
- `cli/src/commands/setup.ts` — Replaced install loop with hierarchy logic, `--no-mcp` → `--no-rules`
- `cli/README.md` — Updated platforms table, setup flags, default behavior description
- Root `README.md` — Quick Start restructured with `nex setup` as primary

### 3. P1 Integrations — Already Complete

Verified all surfaces already have integration tools:
- MCP: `tools/integrations.ts` (4 tools)
- OpenClaw: `nex_list/connect/disconnect_integration`
- SKILL.md: Full API documentation
- CLI slash commands: `/integrate`

### 4. Previous Session Work (still uncommitted)

- `nex setup` is now the recommended onboarding path (README updates)
- Core PRs: #681 merged (historical email), #687 created (deploy workflow fix)

## Build & Test

```bash
cd /Users/najmuzzaman/Documents/nex/nex-as-a-skill
cd cli && npm run build && npm test    # CLI: 65 tests pass
cd ../mcp && npm run build             # MCP server
```

## NOT YET DONE

### Commit & Publish
- All changes are uncommitted in nex-as-a-skill repo
- Version bump needed: 0.1.18 → 0.1.19
- `npm publish --access public` after commit

### Aider Support
- Aider has NO MCP support — rules-only platform
- `aider-conventions.md` template created but `nex setup` doesn't handle Aider yet
- Need to add Aider to `platform-detect.ts` (detect via `which aider` or `.aider.conf.yml`)

### TUI Polish (P2, plan exists)
- Plan at `.claude/plans/wobbly-roaming-tulip.md`
- Shared `lib/tui.ts` already partially built (used by setup status, integrate list)
- Remaining: ask/search/scan/task formatters, arrow-key choose()

## Key Files

| File | Purpose |
|------|---------|
| `cli/platform-rules/*.md` | Rules/instruction templates for each platform |
| `cli/src/lib/platform-detect.ts` | Platform detection + capabilities |
| `cli/src/lib/installers.ts` | MCP + plugin + rules installer functions |
| `cli/src/commands/setup.ts` | Setup command — hierarchy-based install logic |
| `cli/README.md` | npm README |
| `README.md` | Repo README |

## Core Repo Status

- **PR #687**: Deploy workflow fix (`service=all` on `workflow_dispatch`) — open, needs merge
- **PR #681**: Historical email processing — merged, deployed to staging, prod deploy triggered (run 22876044405)
- **PR #673**: Gmail reconnect — awaiting Doug's re-review
