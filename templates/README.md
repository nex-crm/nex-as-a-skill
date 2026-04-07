# Nex Agent Templates

Pre-built agent templates that users copy-paste into their AI agent for guided setup.

## How it works

1. User copies a setup prompt from the Nex website or docs
2. Pastes it into their AI agent (Claude Code, ChatGPT, Cursor, etc.)
3. AI agent runs `nex-cli template run <slug>`
4. CLI orchestrates: register → connect → sync → activate → run

## Available Templates

| Template | Slug | Required Integrations | Description |
|----------|------|----------------------|-------------|
| CRM Hygiene Agent | `crm-hygiene` | CRM (required), Email (optional) | Daily duplicate detection, field audit, stale records |

## Quick Prompt (for demos and website copy button)

Copy this into any AI agent. Replace HubSpot with your CRM if different.

---

Set up a CRM Hygiene Agent using Nex. I use HubSpot.

Install nex-cli if missing: `curl -fsSL https://raw.githubusercontent.com/nex-crm/nex-as-a-skill/main/install.sh | sh`

Run: `nex-cli template run crm-hygiene --crm hubspot`

If all steps show [skip], re-run with `--force`. Tell me what each step means in plain language as it runs.

**Important: Do NOT pull raw CRM data or write analysis scripts.** Nex runs the audit server-side. The CLI will show you the findings when the run completes. Just wait for the output.

Present the findings exactly as Nex returns them — grouped by type (duplicates, missing fields, stale records) with severity and recommended actions.

Then ask me: "Nex found [N] issues. Want me to fix any?" List each fixable action and wait for my approval. Use `nex-cli update-record <id> <field>=<value>` or Nex MCP tools to make approved changes. Never modify records without asking first.

---

## Full Prompt (detailed 5-phase version)

Copy this into any AI agent (Claude Code, ChatGPT, Cursor, etc.):

---

Set up a **CRM Hygiene Agent** using Nex. This agent audits my CRM daily for duplicate contacts, missing fields, and stale records. I use **[YOUR CRM: HubSpot / Salesforce / Attio]**.

## Phase 1: Install

Check if `nex-cli` exists: `which nex-cli`. If not found:
```
curl -fsSL https://raw.githubusercontent.com/nex-crm/nex-as-a-skill/main/install.sh | sh
```
Verify: `nex-cli --version` must print a version number.
If the install script fails, visit https://github.com/nex-crm/nex-cli/releases for manual download.

## Phase 2: Setup

Run:
```
nex-cli template run crm-hygiene
```

This walks through 10 steps: auth, CRM connection, data sync, agent activation, first run. Each step prints `[ OK ]` or `[FAIL]`.

**If auth fails**: The CLI prints exact commands to register. Follow them, then re-run.
**If a step fails**: Read the error. Fix it. Re-run — the CLI resumes from where it stopped.
**If all steps show `[skip]`**: A previous run completed. Run with `--force` for a fresh audit.

Tell me what each step does as it runs. Not the technical output — what it means. Example:
- "Connecting to your HubSpot account..."
- "Syncing your CRM data (47 contacts, 12 companies so far)..."
- "Agent activated — running first audit now..."

## Phase 3: Results

The template run triggers a server-side audit. Nex analyzes your CRM data using its intelligence engine — you do NOT need to pull raw data or write scripts.

The CLI polls the run status and displays findings when complete. Each finding has a type, severity, title, evidence, and recommended action — all computed by Nex.

**Do NOT pull raw CRM records or analyze data yourself.** The findings come from Nex's server-side agent run. Just present what the CLI outputs.

Format the findings as:

```
CRM HYGIENE REPORT (by Nex)
═══════════════════════════════════════════════
Agent:        CRM Hygiene Agent
CRM:          [provider]
Analysis:     Server-side (Nex intelligence engine)

DUPLICATES ([count]):
  [severity] [title]
  → [recommended action]

MISSING FIELDS ([count]):
  [severity] [title]
  → [recommended action]

STALE RECORDS ([count]):
  [severity] [title]
  → [recommended action]

NEXT RUN: Tomorrow at 9:00 AM
═══════════════════════════════════════════════
```

If the run is still in progress: "Nex is analyzing your CRM. This takes 1-2 minutes. Run `nex-cli template run crm-hygiene` to check again — it will resume from where it stopped."

## Phase 4: Offer to Fix

**This is critical. Do not skip this phase.**

After presenting the report, ask me:

> "I found [N] issues in your CRM. Want me to fix any of these?"

Then list each fixable issue with a clear action:

```
RECOMMENDED ACTIONS
═══════════════════════════════════════════════
1. MERGE DUPLICATES ([count] sets)
   - Merge "Jeremy Henrickson" (keep record with more data)
   - Merge "Krithika Shankarraman" (keep record with more data)
   → Shall I merge these? [y/n]

2. FILL MISSING FIELDS ([count] gaps)
   - [X] contacts missing email — can attempt to find from LinkedIn/web
   - [Y] companies missing industry — can infer from description
   → Shall I attempt to fill these? [y/n]

3. ARCHIVE STALE RECORDS ([count] records)
   - [X] records with no activity in 90+ days
   - [Y] deals past expected close date
   → Shall I flag these for review? [y/n]
═══════════════════════════════════════════════
```

For each action the user approves:
- Use `nex-cli` to update records: `nex-cli update-record <id> <field>=<value>`
- If nex-cli can't update (API limitation), use Nex MCP tools if available
- Show what was changed after each action
- **Never modify records without explicit approval**

## Phase 5: What's Next

Tell me:
1. The agent now runs daily — I don't need to do anything
2. To check findings anytime: `nex-cli insights` or ask "what did my CRM hygiene agent find?"
3. To re-run manually: `nex-cli template run crm-hygiene --force`
4. Show me:
   ```
   cat ~/.nex/README.md   # Generated during setup — shows your workspace layout and available commands
   ```

## Rules

- **Never skip a failed step.** Read the error, fix it, re-run.
- **Explain in plain language.** Not "stepReadiness polled 404 with retry." Say "Waiting for your CRM data to sync..."
- **If 3 attempts fail on the same step**: Stop. Tell me what's wrong and what to try manually.
- **End with the report AND the fix offer.** The report shows what's wrong. The fix offer is what makes this valuable.
- **Never modify CRM records without explicit user approval.** Always ask first, then act.
- **Data source transparency.** Tell the user whether findings came from synced Nex data or live CRM. If data looks stale (>24h since sync), note it.

---

## Adding a New Template

Create a YAML file in this directory following the schema in `crm-hygiene.yaml`. The template spec declares:

- `integrations` — what to connect and which providers are supported
- `readiness` — thresholds for when enough data has synced to proceed
- `agent.slug` — which pre-built agent to activate

Templates are fetched from the Nex API at runtime by the CLI. This directory is the canonical source for template definitions that get loaded into the server.
