# PR 03: Operational Aliases

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-03-operational-aliases`
- Size target: `<450` changed lines
- Upstream PRs: `00`, `01`
- Downstream PRs: `07`

## Goal

Restore old operational command surfaces that are currently missing or renamed:

- `detect`
- `workspace ...`
- `config show`
- `config path`
- minimal `config set` if it can be restored cleanly

## Scope

- add a dedicated `detect` command that prints current platform detection
- add `workspace` alias/namespace around current `ws` behavior
- add config inspection commands that match old expectations
- preserve current `ws`/`config` behavior

## Out of Scope

- full workspace rename UX if that expands the diff too far
- setup installer changes
- release manifest changes

## Files Likely Touched

- `ts/src/features/config/commands.ts`
- `ts/src/features/config/handlers.ts`
- maybe a small formatter/helper file

## Implementation Plan

1. Reuse current platform-detect functions behind a new `detect` command.
2. Add `workspace` as an alias namespace that forwards to `ws` behavior.
3. Add read-only config info commands first.
4. Add `config set` only if the current config model supports it without widening the diff too much.
5. Add tests for alias routing and output shape.

## Validation

- `detect` shows the same platforms current setup sees
- `workspace list` and `workspace switch/use` work
- `config show` and `config path` return useful output
