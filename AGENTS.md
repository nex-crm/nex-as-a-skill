# --- Nex Context & Memory ---

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/). All commit messages must follow the format: `type(scope): description`

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

Commitlint enforces this via a `commit-msg` hook.

## Pre-commit Hooks

Lefthook runs the following checks on commit:
- **biome** — JS/TS/JSON formatting and linting
- **secretlint** — secret detection
- **merge conflict markers** — prevents committing unresolved conflicts
- **large file check** — blocks files >5MB

Setup: `bun install && bunx lefthook install`

# Nex — Organizational Context & Memory

Nex provides your AI agent with real-time organizational knowledge — contacts, deals, meetings, emails, notes, insights, patterns, playbooks, and executable skills — via MCP tools. Context is proactively injected into your conversation, so relevant knowledge surfaces automatically even when you don't ask for it.

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

### `nex_get_notifications` — View recent notifications
Check for new notifications from Nex. Shows deal changes, meeting updates, relationship insights, and custom alerts.

### `nex_set_notification_preferences` — Update notification settings
Change notification frequency or toggle notification types. Example: set polling to every 5 minutes.

### `nex_create_notification_rule` — Create custom notification rules
Set up AI-powered notification rules in natural language. Example: "notify me when deal value changes by more than 10%".

### `list_skills` — List agent skills
List executable skills synthesized from playbook rules. Skills are grounded to workspace tools, team, and CRM schema.

### `get_skill_by_slug` — View a skill
Get the full skill content by slug name. Shows trigger condition, action steps, required integrations, and Composio actions.

### `compile_skills` — Trigger skill compilation
Re-synthesize skills from the latest playbook rules. Runs automatically after playbook compilation on cron.

### `generate_skill` — Create a skill from a prompt
Create a new skill from scratch. Read workspace context first with `query_context` and `search_entities`, then generate the full skill markdown and store it. Use when the user asks to create a new workflow or automation.

### `update_skill` — Improve a skill
Patch or replace a skill's content. Use when the user corrects an approach during execution — the skill improves for next time.

### `download_skill` — Download a skill
Download a skill by ID and return the raw markdown with YAML frontmatter.

### `read_skill` — Read a synced skill locally
Read a skill by slug from `.nex/skills/` first, with API fallback if it is not cached locally.

### `sync_skills` — Sync skills locally
Download all skills to `.nex/skills/` as markdown files. Local agents read these directly without API calls.

## Proactive Context

Nex automatically surfaces relevant context from the user's knowledge graph on every prompt — not just questions. When you see a `<nex-context>` block, use it naturally to inform your response:

- **Entity insights** — facts about people, companies, and deals mentioned or relevant to the task
- **Knowledge insights** — patterns, lessons learned, and domain knowledge from past work
- **Playbook rules** — proven approaches and best practices from the user's experience
- **Agent skills** — executable workflows the agent can follow, with specific tools, steps, and decision points

Leverage this context to provide more informed, personalized responses. If the context mentions a relevant pattern or past decision, incorporate it naturally without explicitly referencing the context block.

## When to Use Nex Tools Directly

Use `nex_ask` proactively when:
- The user mentions a person, company, or project — look up their context
- The task involves a domain the knowledge graph may have insights on
- You need organizational context to make a better recommendation

Use `nex_remember` when:
- The user shares a decision, preference, or important fact worth persisting
- A conversation reveals new knowledge that future sessions should have access to

Always try `nex_ask` first for general queries. Use `nex_search` when you need to find a specific record by name.

# --- End Nex ---
