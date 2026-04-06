# PR 02: Upgrade Command

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-02-upgrade-command`
- Size target: `<250` changed lines
- Upstream PRs: `00`
- Downstream PRs: none

## Goal

Restore an explicit `upgrade` command so the new CLI can self-update like the old package could.

## Scope

- add `upgrade` command registration
- implement version check and install path for `nex-cli`
- keep behavior non-interactive and predictable
- add focused tests for version comparison and no-update path

## Out of Scope

- npm dist-tag changes
- wrapper package auto-install logic
- GitHub release workflow changes

## Files Likely Touched

- `ts/src/features/config/commands.ts` or a new small feature module
- `ts/src/features/.../handlers.ts`
- maybe a small utility file for version compare and package-manager detection

## Implementation Plan

1. Port the old compare/version-check logic in a minimal form.
2. Update package-manager/install commands for the `nex-cli` binary world.
3. Ensure the command exits cleanly when already up to date.
4. Keep the implementation independent from setup or auth state.
5. Add narrow tests around version comparison and command routing.

## Validation

- `nex-cli --cmd "upgrade"` prints current state and handles no-op case
- failure messages are actionable
- implementation stays isolated from other parity work
