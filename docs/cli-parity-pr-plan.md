# CLI Parity PR Plan

Date: 2026-04-06
Branch: `feat/nex-as-a-skill-parity-00-planning-docs`

## Purpose

This document is the master index for the CLI parity rollout in `nex-as-a-skill`.

It enforces four rules:

- every implementation branch starts from `main` in this repo
- every PR stays below 500 changed lines unless it is re-split first
- every PR is themed around one owned surface in this repo
- every PR body links any required upstream runtime PRs instead of absorbing that work here
- published size targets reserve review-churn headroom; once a slice looks likely to grow past roughly 450 changed lines, split it before review

This is the repo-local implementation index for `nex-crm/nex-as-a-skill#87`.

## Source of Truth

The canonical behavior target is the published `@nex-ai/nex` package.

The canonical implementation base is:

- repository: `nex-crm/nex-as-a-skill`
- branch base: `main`

Do not plan work against exploratory branches in `nex-cli` or other repos. If a runtime dependency lives elsewhere, link it as an upstream dependency from the repo-local PR instead of pretending the code lives here.

## Repo Boundary

This repo owns:

- the bootstrap wrapper in `src/`
- npm shims in `bin/`
- the curl installer in `install.sh`
- package and registry metadata in `package.json` and `server.json`
- slash-command content in `plugin-commands/`
- platform instructions in `platform-rules/`
- platform assets in `platform-plugins/`
- the Claude Code plugin in `claude-code-plugin/`
- the OpenClaw plugin in `openclaw-plugin/`
- shell-only scripts in `scripts/`

This repo does not own:

- the interactive TUI runtime
- command-browser UX implementation
- backend auth, integration, or notification APIs
- MCP server runtime code that lives outside this tree

Those dependencies may still exist, but they must be linked as upstream PRs in real PR bodies.

## Working Rules

1. No implementation PR over 500 changed lines.
2. If a slice threatens to cross 500 lines, split it before code review starts.
3. Keep one behavior family per PR.
4. Prefer file-cluster boundaries that match the repo layout.
5. Runtime dependencies in other repos belong in `Upstream PRs`, not in the local diff.
6. Finish release and registry alignment last, after behavior and asset parity are landed.

## Branch Naming Convention

Pattern:

`feat/nex-as-a-skill-parity-<nn>-<short-scope>`

Examples:

- `feat/nex-as-a-skill-parity-01-wrapper-release-source`
- `feat/nex-as-a-skill-parity-10-claude-plugin-setup-surface`
- `feat/nex-as-a-skill-parity-16-release-registry-alignment`

## Sequence Overview

### Phase 0: Planning

| PR | Branch | Goal | Size Target | Doc |
|---|---|---|---:|---|
| 00 | `feat/nex-as-a-skill-parity-00-planning-docs` | Correct the rollout plan and re-slice it against `main` in this repo | <350 | [PR 00](./cli-parity-prs/00-planning-docs.md) |

### Phase 1: Wrapper, Install, and Quick Start

| PR | Branch | Goal | Size Target | Doc |
|---|---|---|---:|---|
| 01 | `feat/nex-as-a-skill-parity-01-wrapper-release-source` | Tighten wrapper release-source and version behavior in `src/nex.ts` | <250 | [PR 01](./cli-parity-prs/01-wrapper-release-source.md) |
| 02 | `feat/nex-as-a-skill-parity-02-install-and-shims` | Align `install.sh` and npm shim behavior with the wrapper contract | <350 | [PR 02](./cli-parity-prs/02-install-and-shims.md) |
| 03 | `feat/nex-as-a-skill-parity-03-readme-quickstart` | Rewrite install, auth, and setup copy around the current architecture | <350 | [PR 03](./cli-parity-prs/03-readme-quickstart.md) |

### Phase 2: Distributed Command and Instruction Assets

| PR | Branch | Goal | Size Target | Doc |
|---|---|---|---:|---|
| 04 | `feat/nex-as-a-skill-parity-04-plugin-commands-memory` | Bring memory-oriented slash commands to package parity | <300 | [PR 04](./cli-parity-prs/04-plugin-commands-memory.md) |
| 05 | `feat/nex-as-a-skill-parity-05-plugin-commands-ops` | Bring registration, integration, notification, and scan command docs to parity | <350 | [PR 05](./cli-parity-prs/05-plugin-commands-ops.md) |
| 06 | `feat/nex-as-a-skill-parity-06-platform-rules-core` | Update core editor rules for Cursor, Windsurf, VS Code, and Codex | <450 | [PR 06](./cli-parity-prs/06-platform-rules-core.md) |
| 07 | `feat/nex-as-a-skill-parity-07-platform-rules-secondary` | Update the remaining editor and agent rule bundles | <450 | [PR 07](./cli-parity-prs/07-platform-rules-secondary.md) |
| 08 | `feat/nex-as-a-skill-parity-08-platform-plugins-core` | Bring Continue and OpenCode assets to parity | <450 | [PR 08](./cli-parity-prs/08-platform-plugins-core.md) |
| 09 | `feat/nex-as-a-skill-parity-09-platform-plugins-workflows` | Bring Windsurf, KiloCode, and VS Code workflow assets to parity | <450 | [PR 09](./cli-parity-prs/09-platform-plugins-workflows.md) |

### Phase 3: Plugin Runtime Bundles

| PR | Branch | Goal | Size Target | Doc |
|---|---|---|---:|---|
| 10 | `feat/nex-as-a-skill-parity-10-claude-plugin-setup-surface` | Align Claude Code plugin setup docs, settings, and shipped commands | <450 | [PR 10](./cli-parity-prs/10-claude-plugin-setup-surface.md) |
| 11 | `feat/nex-as-a-skill-parity-11-claude-plugin-recall-foundation` | Bring Claude Code recall and session-start behavior to parity | <500 | [PR 11](./cli-parity-prs/11-claude-plugin-recall-foundation.md) |
| 12 | `feat/nex-as-a-skill-parity-12-claude-plugin-capture-scan` | Bring Claude Code capture and scan behavior to parity | <500 | [PR 12](./cli-parity-prs/12-claude-plugin-capture-scan.md) |
| 13 | `feat/nex-as-a-skill-parity-13-openclaw-plugin-tool-surface` | Bring OpenClaw tool and command registration to parity | <500 | [PR 13](./cli-parity-prs/13-openclaw-plugin-tool-surface.md) |
| 14 | `feat/nex-as-a-skill-parity-14-openclaw-plugin-behavior` | Bring OpenClaw recall, capture, and scan behavior to parity | <500 | [PR 14](./cli-parity-prs/14-openclaw-plugin-behavior.md) |
| 15 | `feat/nex-as-a-skill-parity-15-shell-scripts-parity` | Align shell-only bootstrap and API helper scripts with the package contract | <300 | [PR 15](./cli-parity-prs/15-shell-scripts-parity.md) |

### Phase 4: Release Alignment

| PR | Branch | Goal | Size Target | Doc |
|---|---|---|---:|---|
| 16 | `feat/nex-as-a-skill-parity-16-release-registry-alignment` | Align npm and MCP registry metadata after the owned surfaces land | <250 | [PR 16](./cli-parity-prs/16-release-registry-alignment.md) |

## Shipping Order

Ship in numeric order.

The intended dependency chain is:

- `00` establishes the corrected plan
- `01` through `03` stabilize bootstrap and onboarding copy
- `04` through `09` align the distributed command and editor assets
- `10` through `15` align the bundled plugin and script runtimes
- `16` closes the loop on release metadata and registry output

## Dependency Semantics

- `Upstream PRs` means hard merge blockers for the local slice.
- `Downstream PRs` means planned follow-on slices that consume or build on the outcome here.
- Numeric order is the default sequencing rule on top of those fields; do not infer an extra hard dependency unless the downstream PR also lists this PR under `Upstream PRs`.

## Cross-Repo Dependency Rule

If a repo-local PR depends on a runtime change in `nex-cli`, `mcp`, or another repo:

- keep the `nex-as-a-skill` PR scoped to its owned files
- link the runtime PR under `Upstream PRs`
- do not widen the local PR to compensate

## PR Body Template

Every implementation PR should include:

```text
Upstream PRs:
- #<id> <title>

Downstream PRs:
- #<id> <title>

What ships in this PR:
- ...

What is intentionally not included:
- ...
```

If there is no upstream or downstream link yet:

```text
Upstream PRs:
- none

Downstream PRs:
- planned follow-on PRs: PR <nn>, PR <nn>
```

## Review Standard

- the file list should make the theme obvious
- the validation surface should be narrow and local
- reviewers should not need cross-repo context to understand the local diff
- if a PR body says a runtime dependency exists elsewhere, the local diff must still be useful and reviewable on its own

## Per-PR Plan Docs

- [PR 00: Planning Docs](./cli-parity-prs/00-planning-docs.md)
- [PR 01: Wrapper Release Source](./cli-parity-prs/01-wrapper-release-source.md)
- [PR 02: Install and Shims](./cli-parity-prs/02-install-and-shims.md)
- [PR 03: README Quick Start](./cli-parity-prs/03-readme-quickstart.md)
- [PR 04: Plugin Commands Memory](./cli-parity-prs/04-plugin-commands-memory.md)
- [PR 05: Plugin Commands Ops](./cli-parity-prs/05-plugin-commands-ops.md)
- [PR 06: Platform Rules Core](./cli-parity-prs/06-platform-rules-core.md)
- [PR 07: Platform Rules Secondary](./cli-parity-prs/07-platform-rules-secondary.md)
- [PR 08: Platform Plugins Core](./cli-parity-prs/08-platform-plugins-core.md)
- [PR 09: Platform Plugins Workflows](./cli-parity-prs/09-platform-plugins-workflows.md)
- [PR 10: Claude Plugin Setup Surface](./cli-parity-prs/10-claude-plugin-setup-surface.md)
- [PR 11: Claude Plugin Recall Foundation](./cli-parity-prs/11-claude-plugin-recall-foundation.md)
- [PR 12: Claude Plugin Capture and Scan](./cli-parity-prs/12-claude-plugin-capture-scan.md)
- [PR 13: OpenClaw Plugin Tool Surface](./cli-parity-prs/13-openclaw-plugin-tool-surface.md)
- [PR 14: OpenClaw Plugin Behavior](./cli-parity-prs/14-openclaw-plugin-behavior.md)
- [PR 15: Shell Scripts Parity](./cli-parity-prs/15-shell-scripts-parity.md)
- [PR 16: Release Registry Alignment](./cli-parity-prs/16-release-registry-alignment.md)
