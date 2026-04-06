# PR 19: Guided Onboarding Workflow

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-19-guided-onboarding-workflow`
- Size target: `<500` changed lines
- Upstream PRs: `00`, `01`, `07`, `14`, `15`, `18`
- Downstream PRs: `20`, `21`, `22`

## Goal

Restore the package-backed guided onboarding flow that old `/init` and interactive `setup` provided, but on top of WorkOS-first auth.

## Scope

- no-arg `setup` launches an interactive guided flow
- add a compatibility `/init` or equivalent guided entrypoint inside the TUI
- drive platform install, integration choice, and scan steps through inline prompts
- surface completion and next steps clearly

## Out of Scope

- quick switcher
- multi-pane layout
- secondary `chat`, `calendar`, or `orchestration` view work

## Files Likely Touched

- setup handlers and interactive setup state files
- shell prompt and picker components
- auth and setup integration tests

## Implementation Plan

1. Reuse the setup steps already restored in earlier PRs instead of duplicating their logic.
2. Wrap those steps in a guided interactive shell flow.
3. Introduce the old `/init` reachability in a WorkOS-first way.
4. Keep skip and partial-success paths explicit so users can resume setup later.
5. Add interactive tests for guided onboarding success and skip paths.

## Validation

- `setup` with no args starts a guided flow
- the TUI exposes an `/init`-style onboarding entrypoint
- users can complete or skip install, integrations, and scan steps
- setup completion is reflected in status output
