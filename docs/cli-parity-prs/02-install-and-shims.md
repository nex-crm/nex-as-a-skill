# PR 02: Install and Shims

- Target repo: `nex-as-a-skill`
- Base branch: `main`
- Branch: `feat/nex-as-a-skill-parity-02-install-and-shims`
- Size target: `<350` changed lines
- Upstream PRs: `01`
- Downstream PRs: `03`, `16`

## Goal

Align the curl installer and npm shims with the wrapper contract.

## Scope

- `install.sh`
- `bin/nex.js`
- `bin/nex-mcp.js`

## Out of Scope

- README onboarding copy
- final registry metadata

## Files Likely Touched

- `install.sh`
- `bin/nex.js`
- `bin/nex-mcp.js`

## Implementation Plan

1. Keep installer download behavior consistent with the wrapper.
2. Make npm shims match the same delegation semantics.
3. Keep PATH and installation messaging minimal and accurate.
4. Avoid unrelated metadata edits in this slice.

## Validation

- `npm test`
- `sh -n install.sh`
- `node --check bin/nex.js`
- `node --check bin/nex-mcp.js`
