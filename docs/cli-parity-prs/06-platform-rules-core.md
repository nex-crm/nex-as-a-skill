# PR 06: Platform Rules Core

- Target repo: `nex-as-a-skill`
- Base branch: `main`
- Branch: `feat/nex-as-a-skill-parity-06-platform-rules-core`
- Size target: `<450` changed lines
- Upstream PRs: `04`, `05`
- Downstream PRs: `08`, `10`

## Goal

Update the core editor rule bundles that most directly affect setup and daily use.

## Scope

- Cursor
- Windsurf
- VS Code
- Codex

## Out of Scope

- the remaining editor bundles
- platform plugin assets

## Files Likely Touched

- `platform-rules/cursor-rules.md`
- `platform-rules/windsurf-rules.md`
- `platform-rules/vscode-instructions.md`
- `platform-rules/codex-agents.md`

## Implementation Plan

1. Align command examples and install destinations with the current package contract.
2. Keep each rule focused on how that platform should use Nex.
3. Avoid mixing in plugin asset changes.

## Validation

- rule bundles read consistently with the updated slash-command docs
