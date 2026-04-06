# CLI Parity PR Plan

Date: 2026-04-06
Branch: `feat/nex-as-a-skill-parity-00-planning-docs`

## Purpose

This document is the master index for the CLI parity rollout in `nex-as-a-skill`.

It exists to enforce the implementation rule we want to use by default:

- prefer small, digestible PRs
- target less than 500 changed lines when possible
- keep each PR focused on one reviewable behavior slice
- explicitly track upstream and downstream dependencies in every PR

This plan is downstream of [CLI Parity Analysis](./cli-parity-analysis.md) and is the repo-local implementation index for `nex-crm/nex-as-a-skill#87`.

## Source-of-Truth Rule

This rollout is package-backed.

The canonical behavior target is the published `@nex-ai/nex@0.1.68` package.

The canonical implementation base is:

- repository: `nex-crm/nex-as-a-skill`
- branch base: `main`

Do not let exploratory work in other repos or worktrees override what is on `main` here.

## Working Rules

1. No large parity PRs.
2. Every implementation PR must have a dedicated plan doc before code starts.
3. Every PR description should include:
   - `Upstream PRs:`
   - `Downstream PRs:`
   - `What ships in this PR`
   - `What is intentionally not included`
4. If a slice drifts above about 500 changed lines, split it again unless there is a strong reason not to.
5. Prefer shipping enabling plumbing first, then user-facing behavior, then release and distribution updates last.
6. Treat workflow/TUI parity as first-class work. Do not hide it inside unrelated command PRs.

## Branch Naming Convention

Pattern:

`feat/nex-as-a-skill-parity-<nn>-<short-scope>`

Examples:

- `feat/nex-as-a-skill-parity-01-workos-onboarding-entrypoint`
- `feat/nex-as-a-skill-parity-18-conversation-shell-foundation`
- `feat/nex-as-a-skill-parity-22-server-manifest-alignment`

## Sequence Overview

### Phase 0: Planning

| PR | Repo | Branch | Goal | Size Target | Doc |
|---|---|---|---|---:|---|
| 00 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-00-planning-docs` | Land corrected planning/index docs before code | <300 | [PR 00](./cli-parity-prs/00-planning-docs.md) |

### Phase 1: Core Command and Onboarding Reachability

| PR | Repo | Branch | Goal | Size Target | Doc |
|---|---|---|---|---:|---|
| 01 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-01-workos-onboarding-entrypoint` | Restore a first-class onboarding entrypoint with WorkOS-first auth | <350 | [PR 01](./cli-parity-prs/01-register-command.md) |
| 02 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-02-upgrade-command` | Restore `upgrade` command parity | <250 | [PR 02](./cli-parity-prs/02-upgrade-command.md) |
| 03 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-03-operational-aliases` | Restore `detect`, `workspace`, and status/info command reachability | <450 | [PR 03](./cli-parity-prs/03-operational-aliases.md) |
| 04 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-04-notifications-parity` | Restore notification preference and custom-rule workflows | <450 | [PR 04](./cli-parity-prs/04-notifications-parity.md) |
| 05 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-05-list-and-relationship-mutations` | Restore missing relationship and list mutations | <450 | [PR 05](./cli-parity-prs/05-list-and-relationship-mutations.md) |
| 06 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-06-task-and-insights-parity` | Restore task, insight, and related command parity | <450 | [PR 06](./cli-parity-prs/06-task-and-insights-parity.md) |

### Phase 2: Setup and Platform Install Parity

| PR | Repo | Branch | Goal | Size Target | Doc |
|---|---|---|---|---:|---|
| 07 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-07-setup-foundation` | Add setup and status foundation plus `.nex.toml` creation | <450 | [PR 07](./cli-parity-prs/07-setup-foundation.md) |
| 08 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-08-setup-claude-code-install` | Restore Claude Code install behavior in setup | <450 | [PR 08](./cli-parity-prs/08-setup-claude-code-install.md) |
| 09 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-09-setup-rules-install` | Restore rules and instructions installation during setup | <450 | [PR 09](./cli-parity-prs/09-setup-rules-install.md) |
| 10 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-10-setup-non-claude-hooks` | Restore Cursor, Windsurf, and related hook installers | <500 | [PR 10](./cli-parity-prs/10-setup-non-claude-hooks.md) |
| 11 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-11-platform-assets-a` | Restore OpenCode, Continue, and Windsurf workflow assets and installers | <500 | [PR 11](./cli-parity-prs/11-platform-assets-a.md) |
| 12 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-12-platform-assets-b` | Restore VS Code, Kilo, and related custom mode assets and installers | <450 | [PR 12](./cli-parity-prs/12-platform-assets-b.md) |
| 13 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-13-openclaw-installer` | Restore OpenClaw install and config behavior | <400 | [PR 13](./cli-parity-prs/13-openclaw-installer.md) |
| 14 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-14-setup-integrations-step` | Restore setup-time integration selection and connection-aware status | <450 | [PR 14](./cli-parity-prs/14-setup-integrations-step.md) |
| 15 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-15-setup-scan-and-compounding` | Restore setup scan step, reporting, and compounding trigger | <500 | [PR 15](./cli-parity-prs/15-setup-scan-and-compounding.md) |

### Dropped Scope

`PR 16` and `PR 17` are intentionally dropped.

Reason:

- the published package did ship agents
- the new product direction explicitly does not want local agent parity
- we are preserving that correction in the analysis docs, but not shipping those PRs

### Phase 3: Workflow and TUI Parity

| PR | Repo | Branch | Goal | Size Target | Doc |
|---|---|---|---|---:|---|
| 18 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-18-conversation-shell-foundation` | Restore the conversation-first shell foundation | <500 | [PR 18](./cli-parity-prs/18-conversation-shell-foundation.md) |
| 19 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-19-guided-onboarding-workflow` | Restore guided onboarding and interactive setup flow | <500 | [PR 19](./cli-parity-prs/19-guided-onboarding-workflow.md) |
| 20 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-20-secondary-views-and-quick-switcher` | Restore quick-switcher and current-destination workflow equivalents | <500 | [PR 20](./cli-parity-prs/20-secondary-views-and-quick-switcher.md) |
| 21 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-21-focus-model-and-layout` | Restore multi-pane shell layout and focus semantics | <500 | [PR 21](./cli-parity-prs/21-focus-model-and-layout.md) |

### Phase 4: Distribution Alignment

| PR | Repo | Branch | Goal | Size Target | Doc |
|---|---|---|---|---:|---|
| 22 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-22-server-manifest-alignment` | Align server-manifest and MCP-facing metadata after behavior parity is real | <250 | [PR 22](./cli-parity-prs/22-server-manifest-alignment.md) |
| 23 | `nex-as-a-skill` | `feat/nex-as-a-skill-parity-23-npm-and-server-manifest-alignment` | Align npm metadata and local server manifest last | <250 | [PR 23](./cli-parity-prs/23-npm-and-server-manifest-alignment.md) |

## Shipping Order

Ship in numeric order unless a slice is re-split.

The intended dependency chain is:

- `00` first, no code
- `01` through `06` establish core command reachability
- `07` through `15` restore the package setup and install experience
- `18` through `21` restore the package-backed workflow and TUI model
- `22` and `23` align manifests and package metadata only after behavior parity is real in this repo

## Dependency Linking Convention

Every PR should include these sections in the PR body:

```text
Upstream PRs:
- #<id> <title>

Downstream PRs:
- #<id> <title>
```

If there are no links yet:

```text
Upstream PRs:
- none

Downstream PRs:
- planned: PR <nn>, PR <nn>
```

## Review Standard

The default review standard for this rollout is:

- each PR should be understandable without reading the full parity program
- each PR should have a narrow test and verification surface
- reviewers should be able to reason about regressions from the PR title and plan doc alone
- workflow and TUI PRs should be validated with real interactive flows, not only batch tests

## Per-PR Plan Docs

- [PR 00: Planning Docs](./cli-parity-prs/00-planning-docs.md)
- [PR 01: WorkOS Onboarding Entry Point](./cli-parity-prs/01-register-command.md)
- [PR 02: Upgrade Command](./cli-parity-prs/02-upgrade-command.md)
- [PR 03: Operational Aliases](./cli-parity-prs/03-operational-aliases.md)
- [PR 04: Notifications Parity](./cli-parity-prs/04-notifications-parity.md)
- [PR 05: List and Relationship Mutations](./cli-parity-prs/05-list-and-relationship-mutations.md)
- [PR 06: Task and Insights Parity](./cli-parity-prs/06-task-and-insights-parity.md)
- [PR 07: Setup Foundation](./cli-parity-prs/07-setup-foundation.md)
- [PR 08: Setup Claude Code Install](./cli-parity-prs/08-setup-claude-code-install.md)
- [PR 09: Setup Rules Install](./cli-parity-prs/09-setup-rules-install.md)
- [PR 10: Setup Non-Claude Hooks](./cli-parity-prs/10-setup-non-claude-hooks.md)
- [PR 11: Platform Assets A](./cli-parity-prs/11-platform-assets-a.md)
- [PR 12: Platform Assets B](./cli-parity-prs/12-platform-assets-b.md)
- [PR 13: OpenClaw Installer](./cli-parity-prs/13-openclaw-installer.md)
- [PR 14: Setup Integrations Step](./cli-parity-prs/14-setup-integrations-step.md)
- [PR 15: Setup Scan and Compounding](./cli-parity-prs/15-setup-scan-and-compounding.md)
- [PR 18: Conversation Shell Foundation](./cli-parity-prs/18-conversation-shell-foundation.md)
- [PR 19: Guided Onboarding Workflow](./cli-parity-prs/19-guided-onboarding-workflow.md)
- [PR 20: Secondary Views and Quick Switcher](./cli-parity-prs/20-secondary-views-and-quick-switcher.md)
- [PR 21: Focus Model and Layout](./cli-parity-prs/21-focus-model-and-layout.md)
- [PR 22: Server Manifest Alignment](./cli-parity-prs/22-server-manifest-alignment.md)
- [PR 23: npm and Server Manifest Alignment](./cli-parity-prs/23-npm-and-server-manifest-alignment.md)
