# PR 04: Plugin Commands Memory

- Target repo: `nex-as-a-skill`
- Base branch: `main`
- Branch: `feat/nex-as-a-skill-parity-04-plugin-commands-memory`
- Size target: `<300` changed lines
- Upstream PRs: none
- Downstream PRs: `06`, `10`

## Goal

Bring the memory-oriented slash-command docs to package parity.

## Scope

- recall
- remember
- entities

## Out of Scope

- notification or integration commands
- platform rule bundles

## Files Likely Touched

- `plugin-commands/nex:recall.md`
- `plugin-commands/nex:remember.md`
- `plugin-commands/nex:entities.md`

## Implementation Plan

1. Align command descriptions with the current architecture and tool names.
2. Keep examples short and action-oriented.
3. Avoid runtime implementation detail that belongs elsewhere.

## Validation

- slash-command docs are consistent with the current package contract
