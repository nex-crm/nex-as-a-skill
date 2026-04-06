# PR 08: Setup Claude Code Install

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-08-setup-claude-code-install`
- Size target: `<450` changed lines
- Upstream PRs: `00`, `07`
- Downstream PRs: `14`, `15`

## Goal

Restore the old Claude Code setup behavior inside the new `setup` flow.

## Scope

- run Claude Code hook installation during setup
- copy slash commands during setup
- reflect Claude Code install status in `setup status`
- keep install idempotent

## Out of Scope

- non-Claude hook installers
- rules installation for other platforms
- integration or scan setup steps

## Files Likely Touched

- `ts/src/features/config/handlers.ts`
- `ts/src/lib/installers.ts`
- setup tests

## Implementation Plan

1. Call the existing Claude-specific installer from setup orchestration.
2. Thread success/failure results into the setup summary output.
3. Ensure rerunning setup rewrites stale commands/hooks cleanly.
4. Add tests for install invocation and status reporting.

## Validation

- setup installs Claude hooks and slash commands
- rerunning setup is idempotent
- `setup status` reflects Claude Code accurately
