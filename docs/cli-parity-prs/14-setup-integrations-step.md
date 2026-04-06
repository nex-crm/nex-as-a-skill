# PR 14: Setup Integrations Step

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-14-setup-integrations-step`
- Size target: `<450` changed lines
- Upstream PRs: `00`, `07`, `08`, `11`
- Downstream PRs: `15`, `19`

## Goal

Restore the published package setup-time integration flow in a small, reviewable slice.

In `0.1.68`, setup could offer integration connection as part of onboarding, not only as a separate `integrate` command.

## Scope

- inspect available integrations during setup
- support multi-select or repeated integration connection, not only a single auto-picked provider
- support `--no-integrations`
- make `setup status` reflect integration connection state
- keep the OAuth/browser flow explicit and resumable

## Out of Scope

- scan and compounding
- general `integrate` command redesign
- non-setup notification behavior

## Files Likely Touched

- `ts/src/features/config/handlers.ts`
- `ts/src/features/config/setup.ts`
- `ts/src/features/integrations/handlers.ts` if shared helpers are needed
- maybe shared auth or picker helpers

## Implementation Plan

1. Reuse current integration APIs instead of rebuilding connect flows.
2. Add a setup-time selection step that can handle more than one integration choice.
3. Keep setup resumable if the user skips or partially completes OAuth.
4. Feed connection state into `setup status` so the output matches old package expectations.
5. Add tests for skip, partial success, and status rendering.

## Validation

- setup can offer integration connection during onboarding
- `--no-integrations` skips the step cleanly
- users can connect more than one integration across the setup flow
- `setup status` shows integration connection state
