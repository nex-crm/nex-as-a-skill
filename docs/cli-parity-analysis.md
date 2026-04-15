# CLI Parity Analysis

Date: 2026-04-06
Branch: `feat/nex-as-a-skill-parity-00-planning-docs`

## Goal

Re-ground the parity program on `main` in `nex-crm/nex-as-a-skill`.

The previous planning pass inherited assumptions from `nex-cli` work that do not match the file tree in this repo. This document replaces those assumptions with the actual ownership boundary here.

## Glossary

- wrapper: the repo-owned entrypoint logic in `src/`, `bin/`, and `install.sh` that decides how the shipped `nex` surface boots
- shim: a small launcher in `bin/` that delegates into the installed runtime or wrapper path
- plugin bundle: a shipped platform-specific asset or plugin surface under `platform-rules/`, `platform-plugins/`, `claude-code-plugin/`, or `openclaw-plugin/`

## Source of Truth

Behavior target:

- the published `@nex-ai/nex` package

Implementation base:

- repository: `nex-crm/nex-as-a-skill`
- branch: `main`

## What This Repo Owns

| Surface | Owned Paths | Why It Belongs Here |
|---|---|---|
| Wrapper bootstrap | `src/`, `bin/`, `install.sh` | This repo ships the `nex` and `nex-mcp` entrypoints and the curl installer |
| Package and registry metadata | `package.json`, `server.json` | npm and MCP registry output is published from here |
| Slash-command bundles | `plugin-commands/` | These are repo-owned user-facing assets |
| Platform instruction bundles | `platform-rules/` | These are distributed directly from this package |
| Platform workflow assets | `platform-plugins/` | Continue, OpenCode, Windsurf, VS Code, and KiloCode assets are shipped here |
| Claude Code plugin | `claude-code-plugin/` | The full plugin bundle lives in this repo |
| OpenClaw plugin | `openclaw-plugin/` | The full plugin bundle lives in this repo |
| Shell-only automation | `scripts/` | These helpers are part of the distributed package surface |

## What This Repo Does Not Own

This repo does not contain:

- the interactive TUI runtime
- the command-browser implementation
- backend auth, notification, or integration APIs
- the delegated `nex-cli` runtime source

If parity requires changes there, those are upstream dependencies and must be linked from the repo-local PR. They should not be planned as local file edits in this repo.

## Planning Consequences

1. The rollout must be split by repo-owned file clusters, not by imagined `ts/src/...` modules.
2. Runtime behavior dependencies belong in `Upstream PRs`, not in the local diff.
3. The local PR stack should stay under 500 changed lines by slicing along directory boundaries:
   - wrapper and install
   - command assets
   - rule bundles
   - platform plugin assets
   - Claude Code plugin
   - OpenClaw plugin
   - shell scripts
   - final metadata alignment

## Parity Categories

### 1. Bootstrap and Distribution Parity

This includes:

- wrapper version behavior
- release download source
- curl installer flow
- npm shims
- README quick start

Mapped PRs:

- `01`
- `02`
- `03`
- `16`

### 2. Distributed Instruction Parity

This includes:

- slash-command docs
- platform rules
- platform workflow assets

Mapped PRs:

- `04`
- `05`
- `06`
- `07`
- `08`
- `09`

### 3. Bundled Plugin Parity

This includes:

- Claude Code plugin docs, settings, hooks, recall, capture, and scan behavior
- OpenClaw plugin tool registration and memory workflows
- shell-only scripts

Mapped PRs:

- `10`
- `11`
- `12`
- `13`
- `14`
- `15`

## Non-Goals for This Repo Plan

These are explicitly not implementation targets in this repo-level stack:

- recreating the old local agent system
- rebuilding a multi-pane TUI in this repo
- absorbing `nex-cli` runtime work into docs or assets PRs here

## Review Rule

Any PR plan that still references `ts/src/...`, TUI focus management, or other non-existent local modules is incorrect for `nex-as-a-skill` and should be resliced before code starts.
