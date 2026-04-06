# PR 15: Shell Scripts Parity

- Target repo: `nex-as-a-skill`
- Base branch: `main`
- Branch: `feat/nex-as-a-skill-parity-15-shell-scripts-parity`
- Size target: `<300` changed lines
- Upstream PRs: `03`, `05`
- Downstream PRs: `16`

## Goal

Align the shell-only scripts with the current package contract.

## Scope

- API helper script
- register helper script
- scan helper script

## Out of Scope

- plugin bundles
- final registry metadata

## Files Likely Touched

- `scripts/nex-api.sh`
- `scripts/nex-openclaw-register.sh`
- `scripts/nex-scan-files.sh`
- maybe narrow README references if needed

## Implementation Plan

1. Keep the scripts usable for shell-only environments.
2. Align auth and endpoint guidance with the updated README and command docs.
3. Keep any README touch minimal and local to script references.

## Validation

- `sh -n scripts/*.sh`
- script examples match the updated package contract
