# --- Nex Context & Memory ---

# Nex — Organizational Context & Memory

Nex provides your AI agent with real-time organizational knowledge — contacts, deals, meetings, emails, notes, insights, patterns, playbooks, and executable skills — via MCP tools. Context is proactively injected into your conversation, so relevant knowledge surfaces automatically even when you don't ask for it.

## MCP Tools Available

### `search_knowledge` — Broad context retrieval
Use for broad, fuzzy, or topic-based workspace questions.
Examples: "what's the latest on the Acme deal?", "any updates on hiring?"

### `get_entity_brief` / `get_entity_profile` — Grounded entity context
Use when you know which person, company, or deal you need and want the latest grounded brief.

### `search_entities` — Entity lookup and disambiguation
Use when you need to find or disambiguate a person/company by email, name, or domain before pulling a brief.

### `get_tasks` — Task and action-item lookup
Use for to-dos, open action items, and task status questions.

### `save_facts` / `nex_remember` — Store information
Save notes, observations, meeting summaries, or any text to the knowledge base.
Examples: "remember that John prefers email over Slack", store meeting notes

### `external_search` — Web enrichment
Use when internal context is insufficient and you need grounded external information about a company, person, or market.

### `query_context` / `nex_ask` — Open-ended fallback
Use only when the task does not map cleanly to a direct primitive above and you need a synthesized answer to an open-ended context question.

### `nex_list_integrations` — Check connected data sources
Shows which integrations (Gmail, Slack, Calendar, CRM) are connected and active.

### `nex_connect_integration` — Connect a data source
Initiate OAuth connection for Gmail, Google Calendar, Outlook, Slack, Salesforce, HubSpot, or Attio.

### `nex_get_notifications` — View recent notifications
Check for new notifications from Nex. Shows deal changes, meeting updates, relationship insights, and custom alerts.

### `nex_set_notification_preferences` — Update notification settings
Change notification frequency or toggle notification types. Example: set polling to every 5 minutes.

### `nex_create_notification_rule` — Create custom notification rules
Set up AI-powered notification rules in natural language. Example: "notify me when deal value changes by more than 10%".

## Proactive Context

Nex automatically surfaces relevant context from the user's knowledge graph on every prompt — not just questions. When you see a `<nex-context>` block, use it naturally to inform your response:

- **Entity insights** — facts about people, companies, and deals mentioned or relevant to the task
- **Knowledge insights** — patterns, lessons learned, and domain knowledge from past work
- **Playbook rules** — proven approaches and best practices from the user's experience
- **Agent skills** — executable workflows with specific tools, steps, and decision points

Leverage this context to provide more informed, personalized responses. If the context mentions a relevant pattern or past decision, incorporate it naturally without explicitly referencing the context block.

## When to Use Nex Tools Directly

Use the direct tools proactively when:
- The user mentions a person, company, or project — look up their context
- The task involves a domain the knowledge graph may have insights on
- You need organizational context to make a better recommendation

Suggested selection:
- `search_entities` to resolve the right record
- `get_entity_brief` when the target entity is known
- `search_knowledge` for broad topic or timeline questions
- `get_tasks` for to-dos and action items
- `save_facts` when the user shares durable new information
- `external_search` only when internal context is insufficient
- `query_context` / `nex_ask` only as a fallback for open-ended synthesis

Use `save_facts` / `nex_remember` when:
- The user shares a decision, preference, or important fact worth persisting
- A conversation reveals new knowledge that future sessions should have access to

# --- End Nex ---
