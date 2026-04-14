# CLI Workflow Gap Audit

Updated: 2026-04-06
Filename date: 2026-04-05 (audit cutover); the header date tracks the latest revision on this branch.
Branch: `feat/nex-as-a-skill-parity-00-planning-docs`

## Purpose

Enumerate the workflow surfaces that are actually distributed from `nex-as-a-skill` and map each remaining parity gap to a sub-500-line PR.

## Workflow Surfaces Owned Here

### Install and Bootstrap

Owned files:

- `src/nex.ts`
- `bin/`
- `install.sh`
- `README.md`

Observed gap:

- bootstrap, install, and version surfaces are split across wrapper, shims, installer, and docs
- they need to read as one coherent flow and use the same release source and setup language

Mapped PRs:

- `01`
- `02`
- `03`
- `16`

### Slash Commands and Prompted Workflows

Owned files:

- `plugin-commands/*.md`

Observed gap:

- the distributed slash-command content is the repo-owned workflow layer for recall, remember, register, integrate, notify, and scan
- those instructions must match the current architecture and any linked runtime dependencies

Mapped PRs:

- `04`
- `05`

### Editor and Agent Rules

Owned files:

- `platform-rules/*`

Observed gap:

- rule bundles are split across ten targets and should be updated in two reviewable groups
- install destinations, auth expectations, and command examples need to match the current package contract

Mapped PRs:

- `06`
- `07`

### Platform Workflow Assets

Owned files:

- `platform-plugins/*`

Observed gap:

- editor-native assets are already grouped by platform and should be reviewed that way
- Continue and OpenCode can ship together
- Windsurf, KiloCode, and the VS Code agent asset form the second small bundle

Mapped PRs:

- `08`
- `09`

### Claude Code Plugin Workflow

Owned files:

- `claude-code-plugin/`

Observed gap:

- setup docs and shipped commands are one parity slice
- recall and session-start logic are a second slice
- capture and scan are a third slice

Mapped PRs:

- `10`
- `11`
- `12`

### OpenClaw Workflow

Owned files:

- `openclaw-plugin/`

Observed gap:

- tool and command registration should stay separate from recall/capture/scan behavior
- that keeps both slices under the review cap

Mapped PRs:

- `13`
- `14`

### Shell-Only Workflow

Owned files:

- `scripts/`

Observed gap:

- shell-only bootstrap and API helpers need their own parity pass and should not be hidden inside README work

Mapped PR:

- `15`

## Explicitly Excluded from This Repo Audit

The following are not repo-local implementation targets here:

- command-browser UX
- interactive notification or integration pickers
- TUI help screen layout
- old sidebar or focus models

If those require work, that work belongs in the runtime repo and should be linked as an upstream dependency from the relevant `nex-as-a-skill` PR.

## Result

The rollout is now sliced into repo-real, reviewable themes. Each planned PR is small enough to stand alone, and the docs no longer depend on implementation paths that do not exist in this repository.
