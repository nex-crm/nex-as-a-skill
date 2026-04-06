# PR 09: Setup Rules Install

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-09-setup-rules-install`
- Size target: `<450` changed lines
- Upstream PRs: `00`, `07`
- Downstream PRs: `11`, `12`, `13`

## Goal

Restore rules/instructions installation as a first-class setup step across supported platforms.

## Scope

- invoke `installRulesFile()` during setup
- add `--no-rules` gating
- include rules results in setup summary/status
- keep append-vs-overwrite behavior unchanged from installer helpers

## Out of Scope

- hook installers
- custom plugin or platform assets
- integration and scan steps

## Files Likely Touched

- `ts/src/features/auth/commands.ts` or setup command metadata
- `ts/src/features/config/handlers.ts`
- `ts/src/lib/installers.ts`

## Implementation Plan

1. Wire the existing rules installer into setup.
2. Add `--no-rules` only when the behavior actually exists.
3. Update status output so reviewers can see which rules files were touched.
4. Add tests covering standalone and append-style platforms.

## Validation

- setup installs rules for supported detected platforms
- `--no-rules` cleanly skips that step
- append-mode platforms do not duplicate Nex sections
