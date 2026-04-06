# PR 18: Conversation Shell Foundation

- Target repo: `nex-as-a-skill`
- Branch: `feat/nex-as-a-skill-parity-18-conversation-shell-foundation`
- Size target: `<500` changed lines
- Upstream PRs: `00`, `01`, `03`
- Downstream PRs: `19`, `20`, `21`

## Goal

Restore the package-backed workflow foundation of the no-arg TUI.

This PR should bring back the shell behaviors that made the published package feel conversation-first:

- no-arg launch into a conversational home
- slash-command routing foundation
- `/help`
- bare-message routing into ask behavior
- `/clear`
- double-`Ctrl+C` hint-before-exit

## Scope

- shell state and routing only
- help and clear actions needed for the conversational shell
- command normalization between slash input and existing command registry

## Out of Scope

- guided onboarding workflow
- quick switcher
- `chat`, `calendar`, and `orchestration` destinations
- multi-pane layout and focus traversal

## Files Likely Touched

- TUI view and shell state files
- input routing or command-dispatch files
- help and conversation state helpers
- interactive tests

## Implementation Plan

1. Reintroduce a conversation-first home surface for no-arg launch.
2. Add a slash router over the existing command registry.
3. Route plain home input into the ask path when the user is not entering a command.
4. Add a conversation reset command separate from record deletion.
5. Add the hint-first exit behavior and interactive tests.

## Validation

- launching `nex-cli` with no args opens a conversational home
- `/help` works inside the shell
- bare input routes into ask behavior
- `/clear` resets the current conversation state
- first `Ctrl+C` warns and second `Ctrl+C` exits
