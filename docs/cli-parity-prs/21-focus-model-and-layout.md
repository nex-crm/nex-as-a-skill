# PR 21: Focus Model and Layout

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-21-focus-model-and-layout`
- Size target: `<500` changed lines
- Upstream PRs: `00`, `18`, `19`, `20`
- Downstream PRs: `22`

## Goal

Restore the package-backed multi-pane shell behavior in a reviewable slice:

- sidebar or region-aware shell layout
- focus traversal between regions
- `Tab` and `Esc` semantics across the shell

## Scope

- shell layout and focus model only
- back-navigation and region traversal semantics
- enough region structure to support the published package workflow model

## Out of Scope

- changing CRUD command behavior
- revisiting onboarding logic
- distribution alignment

## Files Likely Touched

- shell layout components
- focus and navigation state files
- interactive tests

## Implementation Plan

1. Introduce the minimal multi-region shell structure needed for parity.
2. Recreate `Tab` and `Esc` semantics on top of the new state model.
3. Keep the rendering intentionally small and reusable so the diff stays reviewable.
4. Add interactive tests for focus cycling and back-navigation.

## Validation

- the shell exposes multiple interactive regions
- `Tab` cycles focus between regions
- `Esc` backs out of focused subviews or modes correctly
- the layout supports the conversation and secondary-view workflow model
