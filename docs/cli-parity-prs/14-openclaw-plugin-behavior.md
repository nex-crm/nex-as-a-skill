# PR 14: OpenClaw Plugin Behavior

- Target repo: `nex-as-a-skill`
- Base branch: `main`
- Branch: `feat/nex-as-a-skill-parity-14-openclaw-plugin-behavior`
- Size target: `<500` changed lines
- Upstream PRs: `13`
- Downstream PRs: `16`

## Goal

Bring OpenClaw recall, capture, and scan behavior to parity after the tool surface is stable.

## Scope

- auto-recall behavior
- auto-capture behavior
- file scanning behavior
- context and session helpers used by those flows

## Out of Scope

- new tool registration work

## Files Likely Touched

- `openclaw-plugin/src/capture-filter.ts`
- `openclaw-plugin/src/context-format.ts`
- `openclaw-plugin/src/file-scanner.ts`
- `openclaw-plugin/src/rate-limiter.ts`
- `openclaw-plugin/src/session-store.ts`
- `openclaw-plugin/src/index.ts` for wiring existing tools into the updated behavior only
- `openclaw-plugin/tests/`

## Implementation Plan

1. Keep behavior-specific helpers together in this slice.
2. Reuse the tool surface from PR `13` without widening it.
3. Cover recall, capture, and scan with plugin tests or focused mocks.

## Validation

- `cd openclaw-plugin && bun test`
- recall, capture, and scan flows are covered by focused tests
