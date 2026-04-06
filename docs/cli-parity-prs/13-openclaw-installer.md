# PR 13: OpenClaw Installer

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-13-openclaw-installer`
- Size target: `<400` changed lines
- Upstream PRs: `00`, `07`
- Downstream PRs: none

## Goal

Restore the old OpenClaw install/config behavior as a dedicated small slice.

## Scope

- port or rebuild the OpenClaw installer helper
- configure API key in OpenClaw plugin config
- surface success/failure clearly in setup/status

## Out of Scope

- OpenClaw plugin source changes
- general hook installer work
- setup integration or scan steps

## Files Likely Touched

- `ts/src/lib/installers.ts`
- `ts/src/features/config/handlers.ts`

## Implementation Plan

1. Recreate the old OpenClaw detection/install flow with current paths.
2. Keep failure handling explicit, since the binary may not be installed locally.
3. Update status reporting so reviewers can see what is configured versus merely detected.

## Validation

- setup reports actionable output when OpenClaw is missing
- setup configures OpenClaw when available
- rerunning setup does not duplicate config
