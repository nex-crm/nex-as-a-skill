---
description: Set up a Nex agent from a template or custom prompt. Handles discovery, install, integrations, data sync, agent activation, narrative progress, and findings report.
---

# /nex:template

Set up a Nex agent with guided onboarding.

## Behavior

This command has two modes depending on context:

### Mode 1: User has a specific template in mind

If $ARGUMENTS contains a template slug or "run <slug>", skip discovery and run it:

```bash
nex-cli template run <slug> --machine --crm <provider>
```

### Mode 2: User needs discovery (default)

If no specific template requested, run the full onboarding flow:

**Step 1 — Discovery**

Ask these questions one at a time. Wait for each answer.

1. "What does your team sell and who do you sell to?"
2. "What CRM do you use?" (HubSpot, Salesforce, Attio)
3. "What's the most annoying part of your GTM workflow?"
4. "If you could have an AI teammate audit one thing overnight, what would it be?"

**Step 2 — Template matching**

Install nex-cli if not present:
```bash
curl -fsSL https://raw.githubusercontent.com/nex-crm/nex-cli/main/install.sh | sh
```

List available templates:
```bash
nex-cli template list --json
```

Match the user's answers against template descriptions. Present the best match:

> "Based on what you told me, **[Template Name]** looks like a great fit. It [one-line description].
> Want to go with this, or should I build something custom for [their specific need]?"

If user picks custom → use `/nex:agents` to build a custom agent from their description.
If user picks template → continue to Step 3.

**Step 3 — Setup with narrative**

Run the template:
```bash
nex-cli template run <slug> --machine --crm <provider>
```

The `--machine` flag returns structured JSON. Parse it and narrate in plain English:

| CLI step | What to tell the user |
|----------|----------------------|
| `auth_check` | "Checking your Nex account..." |
| `fetch_template` | "Loading the [name] template..." |
| `check_existing` | "Checking if you already have this agent..." |
| `crm_selection` | (already answered in discovery) |
| `connect_integrations` | "Connecting to your [CRM]..." |
| `poll_readiness` | "Syncing your data... [N] records so far, [M] insights generated..." |
| `activate_agent` | "Activating your [name] agent..." |
| `trigger_run` | "Running the first audit now..." |
| `get_findings` | (present as report — see Step 4) |
| `write_readme` | (skip narrating this) |

If `--machine` returns `need_input` (exit code 2), parse the JSON, ask the user the question in your own words, then re-run with the answer as a flag.

**Step 4 — Findings report**

Present findings as a formatted report, not raw JSON:

```markdown
## [Agent Name] — First Run Report

**Summary:** Found X issues across Y records

### [Finding Type] (N found)
| Record | Details | Recommended Action |
|--------|---------|-------------------|
| ...    | ...     | ...               |

---
**Want me to fix any of these?** I can [action list] with your approval.
```

Group findings by type. Show specific record names. Always end with an offer to act.

**Step 5 — Schedule and next steps**

After presenting findings:

> "This agent runs [schedule]. Next run: [next time].
> Check findings anytime: `nex-cli agents findings <slug>`
> Want to set up another agent? Just tell me what you need."

## Available templates

| Slug | Name | Description | Default Schedule |
|------|------|-------------|-----------------|
| `crm-hygiene` | CRM Hygiene Agent | Audit CRM for duplicates, missing fields, stale records | Daily |
| `closed-lost-reengagement` | Closed-Lost Re-engagement | Find closed-lost deals worth re-engaging | Weekly |
| `meetings` | Meetings Agent | Pre-meeting briefs, post-meeting action items | Before each meeting |

## Flags

| Flag | Effect |
|------|--------|
| `--machine` | Structured JSON output (always use from AI agents) |
| `--crm <provider>` | Skip CRM selection prompt |
| `--force` | Start fresh (clear previous state) |
| `--dry-run` | Show what would happen without executing |
| `--no-interactive` | Skip all prompts, use defaults |

## Check findings after setup

```bash
nex-cli agents findings <slug>
nex-cli agents runs <slug>
nex-cli agents list
```
