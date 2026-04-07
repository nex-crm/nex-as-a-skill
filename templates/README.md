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

Copy this into any AI agent. Replace `[YOUR CRM]` with your CRM provider.

---

I want to set up a Nex agent. I use **[YOUR CRM: HubSpot / Salesforce / Attio]**.

**Install nex-cli** if not already installed:
```
curl -fsSL https://raw.githubusercontent.com/nex-crm/nex-as-a-skill/main/install.sh | sh
```

**Run this template:**
```
nex-cli template run crm-hygiene
```

The CLI handles everything — just follow its prompts. If a step fails, read the error and re-run. The CLI resumes from where it stopped. If all steps show `[skip]`, add `--force` for a fresh run.

Tell me what's happening in plain language as it runs. When it finishes, show me the findings and ask what I want to fix.

---

## Adding a New Template

Create a YAML file in this directory following the schema in `crm-hygiene.yaml`. The template spec declares:

- `integrations` — what to connect and which providers are supported
- `readiness` — thresholds for when enough data has synced to proceed
- `agent.slug` — which pre-built agent to activate

Templates are fetched from the Nex API at runtime by the CLI. This directory is the canonical source for template definitions that get loaded into the server.
