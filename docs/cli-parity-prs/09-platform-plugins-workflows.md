# PR 09: Platform Plugins Workflows

- Target repo: `nex-as-a-skill`
- Base branch: `main`
- Branch: `feat/nex-as-a-skill-parity-09-platform-plugins-workflows`
- Size target: `<450` changed lines
- Upstream PRs: `07`
- Downstream PRs: `16`

## Goal

Bring Windsurf, KiloCode, and VS Code workflow assets to parity.

## Scope

- Windsurf workflows
- KiloCode modes
- VS Code agent asset

## Out of Scope

- Continue and OpenCode assets
- platform rule bundles

## Files Likely Touched

- `platform-plugins/windsurf-workflows/`
- `platform-plugins/kilocode-modes.yaml`
- `platform-plugins/vscode-agent.md`

## Implementation Plan

1. Keep workflow assets aligned with the updated instruction bundles.
2. Group these three assets together because they are workflow-oriented rather than provider-oriented.
3. Keep examples and destinations coherent across the bundle.

## Validation

- asset files are internally consistent and match the updated platform guidance
