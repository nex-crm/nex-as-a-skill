# PR 22: Server Manifest Alignment

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-22-server-manifest-alignment`
- Size target: `<250` changed lines
- Upstream PRs: `01` through `21`
- Downstream PRs: `23`

## Goal

Align the remote MCP server manifest only after runtime and workflow parity are done.

## Scope

- update `server.json` to the intended package and version state
- verify remote package references match the actual post-parity distribution plan
- keep remote and local package references internally consistent

## Out of Scope

- changing remote tool policy
- adding new remote-only tools
- npm dist-tag changes

## Files Likely Touched

- `server.json`
- maybe release workflow metadata if required

## Implementation Plan

1. Confirm the final package and version references after behavior parity is complete.
2. Update the remote MCP manifest once, at the end.
3. Verify the manifest points at the intended transport and package versions.

## Validation

- manifest references are internally consistent
- no stale package version remains in remote MCP metadata
