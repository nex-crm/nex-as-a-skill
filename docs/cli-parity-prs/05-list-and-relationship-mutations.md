# PR 05: List and Relationship Mutations

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-05-list-and-relationship-mutations`
- Size target: `<450` changed lines
- Upstream PRs: `00`
- Downstream PRs: none

## Goal

Restore the missing old mutations that already have lower-layer support:

- `rel delete`
- `list upsert-member`
- `list update-record`

## Scope

- add CLI commands for missing mutations
- reuse the existing client methods already present in `api/client.ts`
- keep current `link` picker flow untouched

## Out of Scope

- broader relationship UI work
- list table formatting changes
- MCP changes

## Files Likely Touched

- `ts/src/features/schema/commands.ts`
- `ts/src/features/schema/handlers.ts`
- `ts/src/store/actions/command.ts` if internal link plumbing needs reuse

## Implementation Plan

1. Add missing subcommands to the schema command registry.
2. Wire each subcommand to the existing client methods.
3. Reuse old naming and argument order where practical.
4. Add focused tests for argument validation and handler dispatch.

## Validation

- `rel delete <record-id> <rel-id>` works
- `list upsert-member <list-id> <record-id>` works
- `list update-record <list-id> <record-id> key=value ...` works
