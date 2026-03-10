# --- Nex Context & Memory ---

# Nex — Organizational Context & Memory

Nex provides your AI agent with real-time organizational knowledge — contacts, deals, meetings, emails, notes, and more — via MCP tools.

## MCP Tools Available

### `nex_ask` — AI-powered context query (recommended)
Use for natural language questions about organizational context.
Examples: "what's the latest on the Acme deal?", "when did I last talk to Sarah?"

### `nex_remember` — Store information
Save notes, observations, meeting summaries, or any text to the knowledge base.
Examples: "remember that John prefers email over Slack", store meeting notes

### `nex_search` — Fuzzy record lookup
Search CRM records (people, companies, deals) by name or keyword.
Use when looking up a specific named entity rather than asking a question.

### `nex_list_integrations` — Check connected data sources
Shows which integrations (Gmail, Slack, Calendar, CRM) are connected and active.

### `nex_connect_integration` — Connect a data source
Initiate OAuth connection for Gmail, Google Calendar, Outlook, Slack, Salesforce, HubSpot, or Attio.

## When to Use Nex

When the user asks about:
- **People or companies** — contacts, relationships, org charts
- **Deals or opportunities** — status, history, next steps
- **Meetings or calls** — past conversations, upcoming schedules
- **Emails or messages** — communication history
- **Organizational context** — company knowledge, team notes, decisions

Always try `nex_ask` first for general queries. Use `nex_search` when you need to find a specific record by name.

# --- End Nex ---
