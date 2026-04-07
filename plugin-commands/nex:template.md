---
description: Set up a Nex agent from a template. Installs, connects integrations, syncs data, and activates the agent automatically.
---

# /nex:template

Set up a Nex agent from a pre-built template.

## Usage

Run the template setup command:

```bash
nex template run <template-slug>
```

Available templates:
- `crm-hygiene` — Daily CRM auditor. Finds duplicates, missing fields, stale records.

## What it does

1. Creates your Nex account (or logs you in)
2. Connects required integrations (e.g., your CRM)
3. Waits for initial data sync (~3-5 minutes)
4. Activates a pre-built agent personalized to your data
5. Runs the first audit and shows findings

## Options

- `--dry-run` — Preview what the template will do without executing
- `--crm <provider>` — Pre-select CRM provider (hubspot, salesforce, attio)
- `--no-interactive` — Non-interactive mode (requires all options as flags)

## Preview mode

```bash
nex template run crm-hygiene --dry-run
```

## Check status after setup

```bash
nex agents findings crm-hygiene
nex agents runs crm-hygiene
```
