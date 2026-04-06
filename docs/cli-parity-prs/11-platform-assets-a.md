# PR 11: Platform Assets A

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-11-platform-assets-a`
- Size target: `<500` changed lines
- Upstream PRs: `00`, `09`
- Downstream PRs: `14`

## Goal

Restore the first set of missing non-rule platform assets:

- OpenCode plugin
- Continue provider
- Windsurf workflows

## Scope

- port the missing asset files into `nex-cli`
- add installer helpers for these assets
- invoke those helpers from setup where appropriate

## Out of Scope

- VS Code custom template or mode asset
- Kilo Code mode
- OpenClaw plugin install

## Files Likely Touched

- `ts/assets/platform-plugins/*`
- `ts/src/lib/installers.ts`
- `ts/src/features/config/handlers.ts`

## Implementation Plan

1. Port only the assets needed for this slice.
2. Keep asset copy/install code separate from hook/rules logic.
3. Report install results in setup output without widening the setup state model too much.
4. Add tests around asset presence and copy destinations.

## Validation

- setup can install OpenCode plugin asset
- setup can install Continue provider asset
- setup can install Windsurf workflows
