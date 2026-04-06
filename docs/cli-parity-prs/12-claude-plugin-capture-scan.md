# PR 12: Claude Plugin Capture and Scan

- Target repo: `nex-as-a-skill`
- Base branch: `main`
- Branch: `feat/nex-as-a-skill-parity-12-claude-plugin-capture-scan`
- Size target: `<500` changed lines
- Upstream PRs: `11`
- Downstream PRs: `16`

## Goal

Bring Claude Code capture and scan behavior to parity without reopening recall code.

## Scope

- capture hook
- scan helper and manifest flow
- context-file plumbing needed by scan and capture

## Out of Scope

- session-start and recall behavior

## Files Likely Touched

- `claude-code-plugin/src/auto-capture.ts`
- `claude-code-plugin/src/auto-scan.ts`
- `claude-code-plugin/src/capture-filter.ts`
- `claude-code-plugin/src/context-files.ts`
- `claude-code-plugin/src/file-manifest.ts`
- `claude-code-plugin/src/file-scanner.ts`
- `claude-code-plugin/src/workspace-data-dir.ts`

## Implementation Plan

1. Keep capture and scan together because they share file and manifest helpers.
2. Do not reopen recall code unless a narrow shared fix is unavoidable.
3. Keep validation focused on hook behavior and scan side effects.

## Validation

- `cd claude-code-plugin && bun test`
- capture and scan paths are covered by focused tests
