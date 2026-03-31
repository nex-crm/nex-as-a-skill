---
description: List, view, compile, and sync entity briefs and workspace playbooks
---
Handle brief/playbook requests based on $ARGUMENTS:

**No arguments → list all briefs:**
Use the `list_briefs` MCP tool. Display results as a table:
| Title | Type | Updated |
Show scope_type 1 as "Entity Brief" and scope_type 2 as "Workspace Playbook".

**Entity name → find and show brief:**
First use `search_entities` to find the entity. Then use `get_entity_brief` with the context_id. Display the full markdown content.

**"workspace" or "playbooks" → list workspace playbooks only:**
Use `list_briefs` with scope_type=2.

**Playbook slug → show workspace playbook:**
Use `get_workspace_playbook` with the slug. Display the full markdown.

**"sync" → sync all briefs to local .nex/briefs/ folder:**
Use `sync_briefs`. Downloads all entity briefs, workspace playbooks, and private playbooks as .md files for fast local access. Structure:
```
.nex/briefs/entities/   — person-brief-lenny-rachitsky.md
.nex/briefs/workspace/  — early-b2b-growth.md
.nex/briefs/private/    — my-writing-style.md
```

**"compile <entity>" → trigger compilation:**
Search for the entity, then use `compile_brief` with the context_id. Add `--private` for a private brief.

**"download <id>" → download as markdown:**
Use `download_brief` with the ID. Display the raw markdown.

**"history <id>" → show version history:**
Use `get_brief_history` with the ID. Display events with diff summaries.

**"read <name>" → read from local .nex/ folder:**
Use `read_brief` with a search term. Reads locally first (zero API cost), falls back to API.
