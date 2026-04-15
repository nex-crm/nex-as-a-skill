# PR 10: Claude Plugin Setup Surface

- Target repo: `nex-as-a-skill`
- Base branch: `main`
- Branch: `feat/nex-as-a-skill-parity-10-claude-plugin-setup-surface`
- Size target: `<450` changed lines
- Upstream PRs: `04`, `05`, `06`
- Downstream PRs: `11`, `12`, `16`

## Goal

Align the shipped Claude Code plugin setup surface before touching runtime behavior.

## Scope

- plugin README
- plugin command files
- settings template

## Out of Scope

- recall logic
- capture logic
- file scanning logic

## Files Likely Touched

- `claude-code-plugin/README.md`
- `claude-code-plugin/commands/`
- `claude-code-plugin/settings.json`

## Implementation Plan

1. Make setup instructions and command docs match the current package contract.
2. Keep runtime code unchanged in this slice.
3. Leave behavior changes for the next two Claude-specific PRs.

## Validation

- docs only plus settings consistency checks
- command bundle and README agree on setup flow
