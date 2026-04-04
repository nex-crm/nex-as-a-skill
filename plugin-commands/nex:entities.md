---
description: Look up entities in Nex by email, name, or domain
---
Look up entities matching: $ARGUMENTS
If no query provided, respond: "Usage: /nex:entities <email|name|domain>"

Use the direct entity lookup tools instead of `query_context`:
1. Call `mcp__nex__search_entities` with the query if the agent has that tool name available, otherwise call `search_entities`.
2. If the result is empty, respond: "No matching entities found."
3. If the result is ambiguous and you need richer detail for a specific match, follow up with `get_entity_brief` / `get_entity_profile`.

Format each entity as a bullet list:
```
Found {count} entities:
- {name} ({type_label}) — {mention_count} mentions
```

Type labels: type "14" → Person, type "15" → Company, all others → Entity.
Only show mention count if available (count > 0).
