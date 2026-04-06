# Published Package Workflow Gap Audit

Date: 2026-04-06
Branch: `feat/nex-as-a-skill-parity-00-planning-docs`

## Purpose

This document isolates workflow parity from command-surface parity.

It is package-backed. The workflow source of truth is the published `@nex-ai/nex@0.1.68` tarball, not repo lineage.

## Sources Compared

Published package workflow evidence:

- `package/dist/index.js`
- `package/dist/tui/slash-commands.js`
- `package/dist/tui/keybindings.js`
- `package/dist/tui/views/slack-home.js`
- `package/dist/tui/views/home-screen.js`
- `package/dist/tui/views/stream.js`
- `package/dist/commands/setup.js`
- `package/README.md`

Planning target:

- current `nex-as-a-skill` `main`

## Workflow Principles

1. Workflow parity means preserving reachable user outcomes.
2. The new CLI does not need a byte-for-byte visual clone of the old TUI.
3. The new CLI does need equivalents for the package-backed interaction model.
4. Secondary package views belong in workflow parity, not batch command parity, and may be adapted into the current destination model instead of restored literally.

## Workflow Inventory

| Package-backed workflow | Why it mattered in `0.1.68` | `nex-as-a-skill` parity target | Planned PR |
|---|---|---|---|
| No-arg launch into a conversation-first home | This was the default product entrypoint | Start in a conversational shell instead of a command-only shell | `18` |
| Slash-command routing | Primary in-app navigation model | Add a slash router over the new command registry | `18` |
| `/help` inside the shell | Discoverability without leaving the conversation flow | Help browser reachable from slash commands and keybindings | `18` |
| Bare-message home input | Users could just type a question without prefixing `ask` | Route plain home input into the ask/query path | `18` |
| `/clear` conversation reset | Users could reset the active conversation state | Add a conversation reset separate from record deletion | `18` |
| Double-`Ctrl+C` exit hint | Prevented accidental exits in the TUI | Add hint-first exit behavior | `18` |
| `/init` guided onboarding | Old CLI exposed a one-entry onboarding workflow | Add a WorkOS-first guided onboarding entrypoint | `19` |
| Interactive `setup` with inline choices | Setup was a guided flow, not just a usage screen | Add a guided `setup` flow over the new setup steps | `19` |
| Setup-time integration selection | Old setup let users choose integrations during onboarding | Keep this inside the guided setup workflow | `19` |
| Connection-aware `setup status` | Setup could report what was connected or still missing | Make status reflect integration and install progress | `19` |
| Quick-switcher overlay | Users could jump between app destinations quickly | Reintroduce a switcher over new shell destinations | `20` |
| Secondary destination workflows | Package shipped dedicated interactive destinations for conversational, calendar, and orchestration browsing | Preserve those user outcomes through current TUI destinations and switcher entries, not redundant standalone commands | `20` |
| Multi-pane shell with sidebar/detail regions | Old app supported richer browsing than a single command line | Reintroduce a multi-region shell where it still improves workflow parity | `21` |
| `Tab` and `Esc` focus semantics across regions | Old UI had real focus traversal between panes | Restore focus and back-navigation semantics in the multi-region shell | `21` |

## What This Audit Changes

### Secondary package destinations

These stay in scope as workflow outcomes. They should not be treated as mandatory standalone command surfaces when the current CLI already has better destination names for the same jobs.

### Agents

Agents are not part of this workflow plan anymore.

The important correction is historical only:

- the published package did ship them
- they are now intentionally de-scoped from the new parity rollout

### `register`

`register` should not define the new auth backend. The workflow requirement is guided onboarding reachability, which should now be satisfied through WorkOS-first flows.

## What Is Not Covered Here

This workflow audit does not redefine:

- CRUD and MCP command parity
- notification/list/task parity
- release or manifest alignment

Those remain in the main parity plan.

## Recommended Workflow Phase

Keep workflow parity as four small PRs:

1. conversation shell foundation
2. guided onboarding workflow
3. secondary views and quick switcher
4. focus model and multi-pane layout

That keeps the workflow work reviewable and avoids folding TUI architecture changes into unrelated command PRs.
