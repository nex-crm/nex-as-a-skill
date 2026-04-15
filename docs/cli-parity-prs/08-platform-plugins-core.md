# PR 08: Platform Plugins Core

- Target repo: `nex-as-a-skill`
- Base branch: `main`
- Branch: `feat/nex-as-a-skill-parity-08-platform-plugins-core`
- Size target: `<450` changed lines
- Upstream PRs: `06`
- Downstream PRs: `16`

## Goal

Bring Continue and OpenCode assets to parity in one reviewable slice.

## Scope

- Continue provider
- OpenCode plugin

## Out of Scope

- Windsurf workflows
- VS Code or KiloCode assets

## Files Likely Touched

- `platform-plugins/continue-provider.ts`
- `platform-plugins/opencode-plugin.ts`

## Implementation Plan

1. Align asset behavior and examples with the updated command and rule surfaces.
2. Keep the diff limited to these two platform assets.
3. Avoid README and release metadata edits here.

## Validation

- asset files build or typecheck where applicable
- examples match the updated docs
