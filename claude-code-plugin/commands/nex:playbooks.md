---
description: List, view, compile, sync, download, read, and view history for entity and workspace playbooks
---
Handle playbook requests based on $ARGUMENTS:

**No arguments → list all playbooks:**
Use the `list_playbooks` MCP tool. Display results as a table:
| Title | Type | Updated |
Show scope_type 1 as "Entity Playbook" and scope_type 2 as "Workspace Playbook".

**Entity name → find and show playbook:**
First use `search_entities` to find the entity. Then use `get_entity_playbook` with the context_id. Display the full markdown content.

**"workspace" or "playbooks" → list workspace playbooks only:**
Use `list_playbooks` with scope_type=2.

**Playbook slug → show workspace playbook:**
Use `get_workspace_playbook` with the slug. Display the full markdown.

**"sync" → sync all playbooks to local .nex/playbooks/ folder:**
Use `sync_playbooks`. Downloads all entity playbooks, workspace playbooks, and private playbooks as .md files for fast local access. Structure:
```text
.nex/playbooks/entities/   — person-playbook-lenny-rachitsky.md
.nex/playbooks/workspace/  — early-b2b-growth.md
.nex/playbooks/private/    — my-writing-style.md
```

**"compile <entity>" → trigger compilation:**
Search for the entity, then use `compile_playbook` with the context_id. Add `--private` for a private playbook.

**"download <id>" → download as markdown:**
Use `download_playbook` with the ID. Display the raw markdown.

**"history <id>" → show version history:**
Use `get_playbook_history` with the ID. Display events with diff summaries.

**"read <name>" → read from local .nex/ folder:**
Use `read_playbook` with a search term. Reads locally first (zero API cost), falls back to API.
