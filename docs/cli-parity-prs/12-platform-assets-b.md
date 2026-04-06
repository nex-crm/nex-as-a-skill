# PR 12: Platform Assets B

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-12-platform-assets-b`
- Size target: `<450` changed lines
- Upstream PRs: `00`, `09`
- Downstream PRs: none

## Goal

Restore the second set of missing non-rule platform assets:

- VS Code custom template or mode asset
- Kilo Code custom mode

## Scope

- port the missing templates into `nex-cli`
- add installer helpers
- surface install results through setup/status

## Out of Scope

- OpenClaw plugin
- OpenCode plugin
- Windsurf workflows

## Files Likely Touched

- `ts/assets/platform-plugins/*`
- `ts/src/lib/installers.ts`
- `ts/src/features/config/handlers.ts`

## Implementation Plan

1. Port VS Code and Kilo assets as-is first.
2. Keep the installer helpers file-copy/append-only.
3. Add tests for destination paths and idempotence.

## Validation

- setup installs the VS Code custom template or mode asset
- setup installs Kilo Code mode asset
- reruns do not duplicate the Kilo mode block
