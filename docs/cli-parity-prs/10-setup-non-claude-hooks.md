# PR 10: Setup Non-Claude Hooks

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-10-setup-non-claude-hooks`
- Size target: `<500` changed lines
- Upstream PRs: `00`, `07`
- Downstream PRs: none

## Goal

Restore setup-time hook installation for Cursor, Windsurf, and Cline.

## Scope

- port the missing hook adapter scripts if needed
- add installer functions for Cursor, Windsurf, and Cline
- invoke them from setup
- add `--no-hooks` and `--no-plugin` gating for hook-only skip behavior

## Out of Scope

- Claude Code hooks
- rules installation
- OpenClaw plugin install

## Files Likely Touched

- `ts/src/lib/installers.ts`
- `ts/src/.../adapters/*`
- `ts/src/features/config/handlers.ts`

## Implementation Plan

1. Port the smallest needed adapter layer from the old CLI.
2. Reintroduce one installer entrypoint per supported hook platform.
3. Keep platform-specific behavior isolated so reviewers can diff each platform path clearly.
4. Gate the whole step behind `--no-hooks` and `--no-plugin`.
5. Add tests for config mutation rather than full end-to-end execution.

## Validation

- setup installs Cursor hooks
- setup installs Windsurf hooks
- setup installs Cline hooks
- skip flags bypass those mutations cleanly
