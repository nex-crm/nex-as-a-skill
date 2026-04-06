# PR 06: Task and Insights Parity

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-06-task-and-insights-parity`
- Size target: `<450` changed lines
- Upstream PRs: `00`
- Downstream PRs: none

## Goal

Close the smaller data-command gaps that remain in the current CLI:

- richer `task list` filters
- richer `task create` options
- old-style filtered `insight list`

## Scope

- expose old task filter flags through current task handlers
- support priority/due/assignee/entity creation fields where already supported by the client
- add filter arguments to insights command

## Out of Scope

- task UI redesign
- new insight backend behavior
- setup changes

## Files Likely Touched

- `ts/src/features/tasks/commands.ts`
- `ts/src/features/tasks/handlers.ts`
- `ts/src/features/graph/commands.ts`
- `ts/src/features/graph/handlers.ts`
- `ts/src/api/client.ts`

## Implementation Plan

1. Expand command parsing only where the current client can already support the request.
2. Prefer additive flags over renaming existing commands.
3. Reuse old semantics for `--last`, `--from`, and `--to` on insights.
4. Add tests around parsing and request construction.

## Validation

- `task list` can filter by entity/assignee/search/completion
- task creation accepts old optional fields
- insights can be filtered by time window
