---
description: List available Nex agent templates or run one. Handles install, integrations, data sync, agent activation, and findings.
---

# /nex:template

Set up a Nex agent from a pre-built template.

## Routing

Handle requests based on $ARGUMENTS:

**No arguments or "list" → list available templates:**
```bash
nex-cli template list
```
If `nex-cli` is not installed, install it first:
```bash
curl -fsSL https://raw.githubusercontent.com/nex-crm/nex-cli/main/install.sh | sh
```

**Template slug or "run <slug>" → run the template:**
```bash
nex-cli template run <slug> --machine
```
Use `--machine` when running from an AI agent (returns structured JSON for input prompts).
Use `--crm <provider>` to skip the CRM selection prompt.
Use `--force` to start fresh (clear previous state).

## Available templates

| Slug | Name | Description |
|------|------|-------------|
| `crm-hygiene` | CRM Hygiene Agent | Audit CRM for duplicates, missing fields, stale records |
| `closed-lost-reengagement` | Closed-Lost Re-engagement | Find closed-lost deals worth re-engaging, draft reconnection emails |
| `meetings` | Meetings Agent | Pre-meeting briefs, post-meeting action items, follow-up emails |

## What it does

1. Checks authentication (creates account or logs in)
2. Connects required integrations (CRM, email, calendar)
3. Waits for initial data sync
4. Activates a pre-built agent personalized to your data
5. Runs the agent and shows findings
6. For templates with actions (email, calendar): presents drafts for approval before sending

## Check findings after setup

```bash
nex-cli agents findings <slug>
nex-cli agents runs <slug>
```
