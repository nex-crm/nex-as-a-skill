# PR 23: npm and Server Manifest Alignment

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-23-npm-and-server-manifest-alignment`
- Size target: `<250` changed lines
- Upstream PRs: `01` through `22`
- Downstream PRs: none

## Goal

Align package metadata and the local MCP manifest last, after the actual parity work is done.

## Scope

- reconcile package versioning strategy in this repo
- update local `server.json`
- document the intended publishing and default-install path
- only then consider npm `latest` or similar distribution changes

## Out of Scope

- wrapper architecture redesign
- adding new runtime behavior in this repo

## Files Likely Touched

- `package.json`
- `server.json`
- maybe README and release workflow docs

## Implementation Plan

1. Confirm the final distribution plan with the implementation repos first.
2. Update local package and server metadata in one small PR.
3. Keep this PR metadata-only so reviewers can validate it quickly.

## Validation

- package version references are not stale
- local MCP manifest matches the intended released package
- no distribution pointer changes land before parity is truly complete
