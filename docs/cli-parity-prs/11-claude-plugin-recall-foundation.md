# PR 11: Claude Plugin Recall Foundation

- Target repo: `nex-as-a-skill`
- Base branch: `main`
- Branch: `feat/nex-as-a-skill-parity-11-claude-plugin-recall-foundation`
- Size target: `<500` changed lines
- Upstream PRs: `10`
- Downstream PRs: `12`, `16`

## Goal

Bring Claude Code session-start and recall behavior to parity in one reviewable slice.

## Scope

- session-start hook
- recall path
- recall worker and cache
- session tracking helpers needed by recall

## Out of Scope

- capture behavior
- scan behavior

## Files Likely Touched

- `claude-code-plugin/src/auto-session-start.ts`
- `claude-code-plugin/src/auto-recall.ts`
- `claude-code-plugin/src/auto-recall-worker.ts`
- `claude-code-plugin/src/recall-filter.ts`
- `claude-code-plugin/src/recall-cache.ts`
- `claude-code-plugin/src/session-store.ts`
- `claude-code-plugin/src/nex-client.ts`
- `claude-code-plugin/src/config.ts`

## Implementation Plan

1. Keep all recall-related behavior in this slice.
2. Touch only the shared helpers required to support recall and session continuity.
3. Leave capture and scan for PR `12`.

## Validation

- `cd claude-code-plugin && bun test`
- recall and session-start behavior are covered by focused tests
