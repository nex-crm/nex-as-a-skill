# PR 03: README Quick Start

- Target repo: `nex-as-a-skill`
- Base branch: `main`
- Branch: `feat/nex-as-a-skill-parity-03-readme-quickstart`
- Size target: `<350` changed lines
- Upstream PRs: `01`, `02`
- Downstream PRs: `04`, `05`, `16`

## Goal

Rewrite install, auth, and setup copy so the top-level README matches the current architecture.

## Scope

- install section
- sign-up and setup examples
- copy-paste bootstrap prompt

## Out of Scope

- plugin internals
- package metadata

## Files Likely Touched

- `README.md`

## Implementation Plan

1. Make the README describe the delegated architecture honestly.
2. Keep examples aligned with the repo-owned wrapper and installer.
3. Update the bootstrap prompt to reflect the current contract.
4. Keep platform-specific detail in later PRs.

## Validation

- docs only
- README install and setup flow reads coherently end to end
