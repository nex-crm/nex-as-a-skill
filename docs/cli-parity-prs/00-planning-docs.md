# PR 00: Planning Docs

- Target repo: `nex-as-a-skill`
- Base branch: `main`
- Branch: `feat/nex-as-a-skill-parity-00-planning-docs`
- Size target: `<350` changed lines
- Upstream PRs: none
- Downstream PRs: `01` through `16`

## Goal

Correct the parity plan so it is rooted in `nex-as-a-skill` `main` and split into real sub-500-line PRs.

## Scope

- rewrite the master plan
- rewrite the analysis and workflow audit
- create one per-PR plan doc for every implementation slice

## Out of Scope

- implementation changes
- runtime work in other repos

## Files Likely Touched

- `docs/cli-parity-pr-plan.md`
- `docs/cli-parity-analysis.md`
- `docs/cli-workflow-gap-audit-2026-04-05.md`
- `docs/cli-parity-prs/`

## Implementation Plan

1. Replace the wrong `nex-cli` assumptions with the real file ownership in this repo.
2. Re-slice the rollout along repo-owned directories.
3. Make the sub-500-line review cap explicit in the master plan and each PR doc.
4. Point the issue and planning PR at the corrected docs.

## Validation

- docs only
- `git diff --check -- docs`
