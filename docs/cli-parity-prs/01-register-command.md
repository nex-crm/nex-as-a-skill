# PR 01: WorkOS Onboarding Entry Point

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-01-workos-onboarding-entrypoint`
- Size target: `<350` changed lines
- Upstream PRs: `00`
- Downstream PRs: `03`, `07`, `18`, `19`

## Goal

Restore a first-class onboarding entrypoint that preserves package reachability while using WorkOS-first auth.

The published package exposed `register`. The new CLI should preserve that user outcome without reviving the old register backend.

## Scope

- add or retain a top-level onboarding entrypoint that satisfies package discoverability
- route onboarding into the WorkOS-first login and workspace bootstrap flow
- persist the active workspace through existing config APIs
- keep help and command discovery coherent
- add focused tests for handler and command registration

## Out of Scope

- restoring the legacy register API path
- API-key issuance redesign
- full interactive setup wizard
- MCP server auth changes

## Files Likely Touched

- `ts/src/features/auth/commands.ts`
- `ts/src/features/auth/handlers.ts`
- `ts/src/features/config/*`
- auth and config tests

## Implementation Plan

1. Decide the minimum compatibility surface:
   - keep `register` as a compatibility entrypoint, or
   - make `register` explicitly forward into the new onboarding flow
2. Reuse existing WorkOS login and workspace persistence helpers.
3. Ensure success leaves the user in an active workspace state.
4. Make failure output explicit so users are guided into the correct next step.
5. Add narrow tests for command reachability, success, and persistence.

## Validation

- the package-backed onboarding entrypoint is reachable from help and dispatch
- successful onboarding leaves an active workspace saved locally
- the command does not call the legacy register backend
