# Nex Agent Templates

Pre-built agent templates that users copy-paste into their AI agent for guided setup.

## How it works

1. User copies a prompt from the Nex website
2. Pastes it into any AI agent (Claude Code, ChatGPT, Cursor, etc.)
3. AI agent installs `nex-cli` and runs the template
4. CLI orchestrates everything: register → connect CRM → sync data → run agent → show findings

## Available Templates

| Template | Slug | Description |
|----------|------|-------------|
| CRM Hygiene | `crm-hygiene` | Daily duplicate detection, missing field audit, stale record cleanup |

## Copy-Paste Prompt

Copy this into any AI agent (Claude Code, ChatGPT, Cursor, etc.):

---

Audit my CRM for data quality issues using Nex. If `nex-cli` is not installed: `curl -fsSL https://raw.githubusercontent.com/nex-crm/nex-cli/main/install.sh | sh`

---

That's it. The AI agent will:

1. Check if `nex-cli` is installed — install it if not
2. Run `nex-cli template list` to discover available templates
3. Pick the right template based on your intent
4. Run it, handle prompts, and present findings

## Adding a New Template

Create a YAML file in this directory following the schema in `crm-hygiene.yaml`. The template spec declares:

- `integrations` — what to connect and which providers are supported
- `readiness` — thresholds for when enough data has synced to proceed
- `agent.slug` — which pre-built agent to activate

Templates are fetched from the Nex API at runtime by the CLI. This directory is the canonical source for template definitions that get loaded into the server.
