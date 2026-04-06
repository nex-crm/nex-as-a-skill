# CLI Parity Analysis

Date: 2026-04-06
Branch: `feat/nex-as-a-skill-parity-00-planning-docs`

Related docs:

- [CLI Parity PR Plan](./cli-parity-pr-plan.md)
- [Published Package Workflow Gap Audit](./cli-workflow-gap-audit-2026-04-05.md)

## Source Correction

Earlier versions of this analysis mixed two different things:

- the published `@nex-ai/nex@0.1.68` package
- repo-history artifacts that were useful context but not the primary parity target

This version is corrected. The canonical behavior target is the published npm package itself, and the canonical implementation base is `main` in `nex-crm/nex-as-a-skill`.

## Goal

Match the shipped user-facing behavior of `@nex-ai/nex@0.1.68` while preserving the current architecture that exists on `main` in `nex-as-a-skill`.

Parity means reproducing shipped outcomes and reachable workflows. It does not mean reviving the old implementation style.

For auth and onboarding specifically, parity should be achieved with a WorkOS-first replacement, not by restoring the legacy register API path verbatim.

## Sources Analyzed

Package-backed sources:

- `npm view @nex-ai/nex version dist-tags --json` on 2026-04-05
  - `version=0.1.68`
  - `dist-tags.latest=0.1.68`
- tarball inspection of `@nex-ai/nex@0.1.68`
- `package/package.json`
- `package/dist/index.js`
- `package/dist/commands/setup.js`
- `package/dist/commands/integrate.js`
- `package/dist/commands/dispatch.js`
- `package/dist/tui/*`
- `package/README.md`

Planning target:

- `nex-crm/nex-as-a-skill`
- branch base: `main`

Exploratory work done in `nex-cli` is no longer authoritative for planning or branch slicing.

## Scope Rules

1. Package-backed user behavior is in scope.
2. Package-backed TUI workflows are in scope, even if they were not top-level batch commands.
3. Bundled internals are not parity targets unless they back a reachable user path.
4. Repo lineage is supporting context only. It does not override the published package.
5. WorkOS-first onboarding is allowed to replace legacy auth mechanics as long as the user outcome remains available.

## What `0.1.68` Actually Ships

### Entrypoints and Modes

The published package exposes:

- `nex`
- `nex-mcp`
- no-arg TUI launch
- `--cmd`
- piped stdin dispatch
- `mcp`
- `upgrade`

### Primary Package Surfaces

These are explicit in package help, README, or dispatch code and should drive the main parity plan:

- `ask`
- `remember`
- `recall`
- `capture`
- `artifact`
- `scan`
- `object *`
- `record *`
- `task *`
- `note *`
- `search`
- `graph`
- `detect`
- `setup`
- `register`
- `workspace`
- `status`
- `integrate *`
- `notify *`
- `rel *`
- `list *`
- `list-job *`
- `upgrade`

### Package-Backed Setup and Install Behavior

The published package setup flow does more than save credentials. It also:

- detects installed platforms
- installs a six-layer platform stack:
  - hooks
  - plugins/tools
  - custom agents or modes
  - workflows/slash commands
  - rules
  - MCP
- creates `.nex.toml`
- offers integration connection during setup
- scans files during setup
- triggers background compounding after meaningful scan work
- exposes connection-aware `setup status`

The package supports these setup flags:

- `--platform`
- `--no-hooks`
- `--no-plugin`
- `--no-rules`
- `--no-integrations`
- `--no-scan`

### Package-Backed Agent Surface

The published package dispatches:

- `agent templates`
- `agent list`
- `agent create`
- `agent inspect`
- `agent start`
- `agent stop`
- `agent steer`

That remains an important factual correction: agents were shipped in the published package.
However, current product direction explicitly de-scopes them. They are no longer part of the parity implementation plan.

### Package-Backed Workflow and TUI Surface

The published package also ships an interactive workflow model:

- no-arg launch into a conversation-first TUI
- slash-command routing
- `/help`
- `/init`
- bare-message home input that routes into ask/chat behavior
- `/clear` conversation reset
- quick-switcher overlay
- double-`Ctrl+C` hint-before-exit behavior
- multi-pane Slack-like layout
- sidebar/thread/compose focus model

These are real parity targets. They need their own workflow phase rather than being treated as incidental UI polish.

### Secondary Package Views

The package also includes secondary TUI destinations and keybinding hints around:

- conversational follow-up flows
- calendar and integration browsing
- task or orchestration status views

These are package-backed workflow signals, but they do not require keeping redundant standalone commands in the new CLI. The parity target is reachable equivalents inside the current shell, help, and quick-switcher model.

## Corrections to Earlier Planning

### 1. Agents were package-backed, but are now intentionally de-scoped

Earlier planning was wrong to treat agents as a wrong-repo artifact.
The published package did ship them.

The product decision is now clear:

- do not carry agent parity forward
- do not reopen local agent command or runtime work
- keep the correction in the record so future scope decisions are based on the package, not on mistaken repo lineage

### 2. Secondary package views were misclassified

The old `chat`, `calendar`, and `orchestration` destinations do not justify a standalone command-parity phase by themselves. They belong under workflow/TUI parity as secondary destinations, with room to adapt them into the current destination model instead of restoring redundant commands literally.

### 3. Workflow parity was under-scoped

The package ships a real conversation-first interactive model. The rollout needs explicit PRs for:

- shell foundation
- guided onboarding workflow
- secondary views and quick switcher
- multi-pane layout and focus model

### 4. Legacy `register` semantics should not drive implementation

The package exposed `register`, but the new plan should preserve onboarding reachability through WorkOS-first flows. The user outcome matters more than reproducing the old API path.

### 5. Platform custom mode or workflow assets remain in scope

Items such as VS Code custom templates, Kilo/OpenCode/Continue/OpenClaw assets, and workflow files remain legitimate setup/install parity work when they were part of the published package install stack. That is separate from local autonomous-agent runtime parity, which is now out of scope.

## Amended View of Work and Pending Work

### Work That Remains Correctly In Scope

- core command parity
- setup and platform install parity
- notification/list/relationship/task parity
- workflow and TUI parity
- final distribution alignment

### Work That Should Be Reframed

- `chat`, `calendar`, and `orchestration`
  - keep as workflow views, not as first-class command parity
- onboarding
  - keep as package reachability and user outcome
  - do not restore the legacy register backend just because it existed

### Work That Should Not Drive the Plan

- repo lineage from non-package sources
- bundled internal modules that were never exposed through a package-backed user path

## Amended Pending Work Buckets

The parity program should now be grouped as:

1. Core command parity
2. Setup and platform install parity
3. WorkOS-first onboarding parity
4. TUI workflow parity
5. Distribution alignment only after behavior parity is real

## Planning Consequences

The rollout plan is amended as follows:

- `PR 01` is re-scoped from a literal register restore to a WorkOS-first onboarding entrypoint
- `PR 16` and `PR 17` are intentionally dropped
- `PR 18` through `PR 21` remain dedicated to workflow/TUI parity
- distribution alignment moves to `PR 22` and `PR 23`

This doc supersedes earlier assumptions that:

- agents were only a wrong-repo artifact
- workflow parity was secondary
- `chat`, `calendar`, and `orchestration` must be restored as standalone command surfaces

## Distribution Constraint

The release-state mismatch still stands:

- npm `latest` for `@nex-ai/nex` is `0.1.68`
- users installing the public package still receive the old package by default

Implication:

- parity must continue to be measured against `0.1.68`
- manifest and package alignment should remain the last phase, after behavior parity is actually present
