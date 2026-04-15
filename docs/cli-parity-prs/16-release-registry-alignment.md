# PR 16: Release Registry Alignment

- Target repo: `nex-as-a-skill`
- Base branch: `main`
- Branch: `feat/nex-as-a-skill-parity-16-release-registry-alignment`
- Size target: `<250` changed lines
- Upstream PRs: `01` through `15`
- Downstream PRs: none

## Goal

Align npm and MCP registry metadata only after the owned surfaces are updated.

## Scope

- package metadata
- published file list
- registry metadata
- final README and version references required by release output

## Out of Scope

- new behavior work
- plugin-runtime refactors

## Files Likely Touched

- `package.json`
- `server.json`
- `README.md`

## Implementation Plan

1. Update package metadata after the repo-owned surfaces are stable.
2. Align registry output with the package version and install contract.
3. Keep this as the last slice so it can summarize the landed behavior rather than predict it.

## Validation

- `npm pack --dry-run`
- metadata versions and install guidance are internally consistent
