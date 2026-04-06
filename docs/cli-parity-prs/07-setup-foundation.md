# PR 07: Setup Foundation

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-07-setup-foundation`
- Size target: `<450` changed lines
- Upstream PRs: `00`, `01`, `03`
- Downstream PRs: `08`, `09`, `10`, `14`, `15`

## Goal

Lay the foundation for full setup parity without yet restoring every installer step.

## Scope

- create `.nex.toml` during setup when missing
- improve `setup status` so it can show richer install state
- centralize setup result formatting so later PRs can add steps cleanly
- introduce any minimal shared setup helpers needed by later PRs

## Out of Scope

- platform hooks/plugins/workflows installation
- setup integration connection step
- setup scan/compounding step

## Files Likely Touched

- `ts/src/features/config/handlers.ts`
- `ts/src/lib/project-config.ts`
- maybe a new small setup helper file under `ts/src/lib/`

## Implementation Plan

1. Wire `writeDefaultProjectConfig()` into the setup path.
2. Create a small setup status model that later PRs can enrich.
3. Avoid adding flags whose behaviors do not ship yet.
4. Add tests for `.nex.toml` creation and status output.

## Validation

- setup creates `.nex.toml` once and does not overwrite it
- `setup status` becomes a reliable base for later installer PRs
