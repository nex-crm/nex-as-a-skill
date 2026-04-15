# PR 05: Plugin Commands Ops

- Target repo: `nex-as-a-skill`
- Base branch: `main`
- Branch: `feat/nex-as-a-skill-parity-05-plugin-commands-ops`
- Size target: `<350` changed lines
- Upstream PRs: none, plus linked runtime PRs if command behavior is still missing upstream
- Downstream PRs: `06`, `10`, `15`

## Goal

Bring the operational slash-command docs to package parity.

## Scope

- register
- integrate
- notify
- scan

## Out of Scope

- memory commands
- platform rules

## Files Likely Touched

- `plugin-commands/nex:register.md`
- `plugin-commands/nex:integrate.md`
- `plugin-commands/nex:notify.md`
- `plugin-commands/nex:scan.md`

## Implementation Plan

1. Update command language for the current architecture.
2. Keep any missing runtime behavior as linked upstream dependencies.
3. Align setup, integration, and notification guidance with the wrapper contract.

## Validation

- docs match the package-owned command surface
- any runtime dependency is called out explicitly in the PR body
