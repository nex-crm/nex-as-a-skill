# PR 00: Planning Docs

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-00-planning-docs`
- Size target: `<300` changed lines
- Upstream PRs: none
- Downstream PRs: `01` through `23`

## Goal

Land the corrected parity docs before code changes begin.

The job of this PR is to make the rollout package-backed, explicitly sequenced, and small-PR-friendly.
It also locks the rollout to the right repo and branch base:

- repo: `nex-as-a-skill`
- base: `main`
- canonical issue: `nex-crm/nex-as-a-skill#87`

## Scope

- add the corrected master plan and index doc
- add or amend one plan doc per planned PR
- replace repo-lineage assumptions with published-package scope
- record the rollout sequence and dependency-linking convention

## Out of Scope

- any production code change
- any manifest or version update
- any repo split or branch creation

## Files Likely Touched

- `docs/cli-parity-analysis.md`
- `docs/cli-workflow-gap-audit-2026-04-05.md`
- `docs/cli-parity-pr-plan.md`
- `docs/cli-parity-prs/*.md`

## Implementation Plan

1. Rewrite the main parity analysis so the published package is the canonical source of truth.
2. Split workflow parity into its own explicit phase.
3. Re-scope onboarding to WorkOS-first parity rather than legacy auth restoration.
4. Record that agents were published, but are intentionally de-scoped from the rollout.
5. Move manifest and package alignment to the final phase.
6. Remove the wrong-repo planning assumption and state that all future branches must start from `main` in this repo.

## Validation

- every planned PR has a corresponding doc
- the master doc links to every PR doc
- workflow parity is explicitly planned
- the corrected scope is clear without reading old analysis history
