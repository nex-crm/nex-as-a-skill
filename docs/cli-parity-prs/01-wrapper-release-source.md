# PR 01: Wrapper Release Source

- Target repo: `nex-as-a-skill`
- Base branch: `main`
- Branch: `feat/nex-as-a-skill-parity-01-wrapper-release-source`
- Size target: `<250` changed lines
- Upstream PRs: none
- Downstream PRs: `02`, `03`, `16`

## Goal

Tighten the wrapper release-source and version behavior in `src/nex.ts`.

## Scope

- release URL and version lookup logic
- `nex` versus `nex-mcp` invocation behavior
- small wrapper-only error and version messaging

## Out of Scope

- installer shell logic
- npm shim files
- release metadata

## Files Likely Touched

- `src/nex.ts`

## Implementation Plan

1. Make release source selection deterministic.
2. Keep `nex-mcp` argument prepending local to the wrapper.
3. Keep version output coherent with the wrapper contract.
4. Verify the compiled binary still delegates cleanly.

## Validation

- `bun run build:binary`
- `./dist/nex --version`
- wrapper delegates to `nex-cli`
