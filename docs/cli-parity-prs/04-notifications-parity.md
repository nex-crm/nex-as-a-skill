# PR 04: Notifications Parity

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-04-notifications-parity`
- Size target: `<450` changed lines
- Upstream PRs: `00`
- Downstream PRs: none

## Goal

Restore the old notification command surface:

- `notify list`
- `notify set-frequency`
- `notify enable`
- `notify disable`

## Scope

- add notification feed listing via existing notifications APIs
- expose preference mutation commands through current client methods
- keep current `notify preferences`, `notify rules`, and `notify rule-delete`

## Out of Scope

- MCP tool changes
- new notification backend behavior
- setup integration wiring

## Files Likely Touched

- `ts/src/features/notifications/commands.ts`
- `ts/src/features/notifications/handlers.ts`
- `ts/src/api/client.ts`

## Implementation Plan

1. Add a client method for notification feed if one is missing.
2. Extend the `notify` handler with old subcommands in the smallest possible shape.
3. Reuse existing preference payload shapes instead of inventing new ones.
4. Keep formatting simple and testable.
5. Add tests for command parsing and API method selection.

## Validation

- `notify list` returns recent notifications
- `notify set-frequency 180` updates preferences
- `notify enable <type>` and `notify disable <type>` mutate the expected flags
