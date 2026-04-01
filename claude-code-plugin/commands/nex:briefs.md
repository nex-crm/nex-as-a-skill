---
description: View entity briefs and workspace playbooks
---
Handle the user's request about briefs and playbooks: $ARGUMENTS

Use these MCP tools based on what the user asks:

**No arguments or "list":** Use mcp__nex__list_briefs to show all entity briefs.

**A person/company name:** Use mcp__nex__search_records to find the entity, then mcp__nex__get_entity_brief with the context ID to get their brief.

**"workspace" or "playbooks":** Use mcp__nex__list_workspace_playbooks to show team-level playbooks.

**"compile <entity>":** Use mcp__nex__compile_brief with the entity ID.

**"history <id>":** Use mcp__nex__get_brief_history to show version changes.

Format the brief content as readable markdown. Highlight key facts, recent changes, and actionable items.
