---
description: Review and act on pending agent proposals
---
Handle approval requests: $ARGUMENTS

**No arguments or "list":** Use mcp__nex__list_proposed_actions to show pending proposals. Display each with risk level, target entity, and action summary.

**"approve <id>":** Use mcp__nex__approve_action with the proposal ID.

**"reject <id>":** Use mcp__nex__reject_action with the proposal ID and ask for a reason.

**"history":** Use mcp__nex__get_action_history to show what the agent has done recently.

**"all":** Use mcp__nex__list_proposed_actions, then for each pending proposal, show a summary and ask the user to approve or reject.

Format proposals clearly: risk level (low/medium/high), what the agent wants to do, why, and the target entity.
