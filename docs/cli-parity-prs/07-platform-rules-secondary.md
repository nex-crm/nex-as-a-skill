# PR 07: Platform Rules Secondary

- Target repo: `nex-as-a-skill`
- Base branch: `main`
- Branch: `feat/nex-as-a-skill-parity-07-platform-rules-secondary`
- Size target: `<450` changed lines
- Upstream PRs: `04`, `05`
- Downstream PRs: `08`, `09`

## Goal

Update the remaining editor and agent rule bundles without mixing them into the core-editor review.

## Scope

- Aider
- Cline
- Continue
- Zed
- OpenCode
- KiloCode

## Out of Scope

- core editor rules
- platform plugin assets

## Files Likely Touched

- `platform-rules/aider-conventions.md`
- `platform-rules/cline-rules.md`
- `platform-rules/continue-rules.md`
- `platform-rules/zed-rules.md`
- `platform-rules/opencode-agents.md`
- `platform-rules/kilocode-rules.md`

## Implementation Plan

1. Align examples and setup guidance with the current contract.
2. Keep the wording platform-specific, not generic.
3. Reuse the same conceptual model introduced in PRs `04` and `05`.

## Validation

- secondary rule bundles are internally consistent and match the current package surface
