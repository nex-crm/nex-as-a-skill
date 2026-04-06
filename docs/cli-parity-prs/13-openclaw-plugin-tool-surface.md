# PR 13: OpenClaw Plugin Tool Surface

- Target repo: `nex-as-a-skill`
- Base branch: `main`
- Branch: `feat/nex-as-a-skill-parity-13-openclaw-plugin-tool-surface`
- Size target: `<500` changed lines
- Upstream PRs: `04`, `05`, `08`
- Downstream PRs: `14`, `16`

## Goal

Bring the OpenClaw plugin's tool and command surface to parity before changing deeper behavior.

## Scope

- tool and command registration
- config parsing
- client surface and schemas needed by the tool layer

## Out of Scope

- recall, capture, and scan internals

## Files Likely Touched

- `openclaw-plugin/src/index.ts`
- `openclaw-plugin/src/config.ts`
- `openclaw-plugin/src/nex-client.ts`
- `openclaw-plugin/tests/`

## Implementation Plan

1. Keep tool registration and config/client surface in one slice.
2. Avoid mixing in filter or scanner changes.
3. Add or update focused plugin tests.

## Validation

- `cd openclaw-plugin && bun test`
- tool registration surface is covered by tests
