# PR 20: Secondary Views and Quick Switcher

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-20-secondary-views-and-quick-switcher`
- Size target: `<500` changed lines
- Upstream PRs: `00`, `18`, `19`
- Downstream PRs: `21`, `22`

## Goal

Restore the package-backed secondary workflow entrypoints through the current shell model:

- quick switcher
- conversational follow-up destinations
- integration and calendar browsing destinations
- task or orchestration-style status destinations

These are workflow destinations, not primary batch-command parity, and they do not require literal legacy command names.

## Scope

- view routing and switcher entrypoints
- keybindings or help affordances that make the destinations reachable
- mapping old package outcomes into the current destination set inside the shell

## Out of Scope

- multi-pane layout and focus traversal
- changing the underlying data model for integrations or tasks
- distribution alignment

## Files Likely Touched

- TUI routing and view-state files
- keybinding and help files
- interactive tests

## Implementation Plan

1. Add the quick switcher over the current view registry.
2. Expose the retained destination equivalents for conversation, integrations, tasks, and related status views.
3. Keep the implementation thin by reusing the new command and view abstractions.
4. Add tests that prove these destinations are reachable from the shell and quick switcher.

## Validation

- the quick switcher opens and routes to destinations
- the old package-backed workflow outcomes are reachable from the TUI without reviving redundant standalone commands
- help and keybinding surfaces expose the destinations coherently
