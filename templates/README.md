# Nex Agent Templates

Pre-built agent templates that users copy-paste into their AI agent for guided setup. Templates are the on-ramp, not the product. The product is: describe what you want, Nex builds the agent.

## How it works

1. User copies a prompt from the Nex website
2. Pastes it into any AI agent (Claude Code, ChatGPT, Cursor, etc.)
3. AI agent asks a few questions to understand the business
4. Discovers available templates via `nex-cli template list`
5. Offers: use a matching template (fast) or build a custom agent from scratch
6. Runs the template, narrates progress in real-time, presents findings as a report
7. Shows the recurring schedule so the user knows their agent is working for them

## Copy-Paste Prompt (Short)

For website hero, Twitter, docs sidebar:

---

**Set up an AI agent for your GTM team with Nex.** Paste this into Claude Code, Cursor, or ChatGPT:

> I want to set up AI agents for my business using Nex. Start by asking me a few questions about my team, then show me what agents are available and help me get one running.

---

## Copy-Paste Prompt (Full)

For landing pages, blog posts, onboarding flows. Paste this entire block into any AI agent:

---

~~~
I want to set up AI agents for my business using Nex. Here's how to help me:

PHASE 1 — DISCOVERY (ask me, don't skip this)
Ask me these questions one at a time. Wait for my answer before the next one.
1. What does your team sell and who do you sell to?
2. What CRM do you use? (HubSpot, Salesforce, Attio, or other)
3. What's the most annoying part of your GTM workflow right now?
4. If you could have an AI teammate audit one thing overnight, what would it be?

PHASE 2 — MATCH
Install nex-cli if not present:
  curl -fsSL https://raw.githubusercontent.com/nex-crm/nex-cli/main/install.sh | sh
Run: nex-cli template list
Match my answers to the best template. If none fit, offer to build a custom agent.
Ask me: "I found [template] — [what it does]. Want to use this, or should I
build something custom for [my specific need]?"

PHASE 3 — SETUP (narrate everything)
Run: nex-cli template run <slug> --machine --crm <my-crm>
While it runs, narrate what's happening like a teammate would:
- "Connecting to your HubSpot..."
- "Syncing your contacts and companies... 247 records so far..."
- "Generating insights from your data..."
- "Activating your CRM Hygiene agent..."
- "Running the first audit now..."
Don't dump raw CLI output. Translate every step into plain English.

PHASE 4 — FINDINGS REPORT
When findings come back, present them as a clear report:

## 🔍 [Agent Name] — First Run Report

**Summary:** Found X issues across Y records

### Duplicates (N found)
| Record | Duplicate of | Confidence |
| ...    | ...          | ...        |

### Missing Fields (N found)
| Record | Missing | Impact |
| ...    | ...     | ...    |

### Stale Records (N found)
| Record | Last Activity | Days Idle |
| ...    | ...           | ...       |

**Want me to fix any of these?** I can [merge duplicates / fill missing fields /
archive stale records] with your approval before touching anything.

PHASE 5 — SCHEDULE & NEXT STEPS
After the first run, tell me:
- "This agent runs daily. Next run: tomorrow at 9am."
- "Check findings anytime: nex-cli agents findings <slug>"
- "Want to set up another agent? I can show you what else is available."
~~~

---

## Available Templates

| Template | Slug | Description | Schedule |
|----------|------|-------------|----------|
| CRM Hygiene | `crm-hygiene` | Duplicate detection, missing field audit, stale record cleanup | Daily |
| Closed-Lost Re-engagement | `closed-lost-reengagement` | Find closed-lost deals worth re-engaging based on signals | Weekly |
| Meetings Agent | `meetings` | Pre-meeting briefs, post-meeting action items, follow-up emails | Before each meeting |

## The Two Paths

**Path 1 — Template (fast):** User's intent matches a template. Run it. Agent is live in 5 minutes with real findings.

**Path 2 — Custom (powerful):** No template fits. The AI agent uses `nex-cli` to connect integrations, compile playbooks, and generate a custom agent from the user's description. This is the real product.

The copy-paste prompt handles both paths. The AI agent decides based on the discovery questions.

## Adding a New Template

Create a YAML file in this directory following the schema in `crm-hygiene.yaml`:

- `integrations` — what to connect and which providers are supported
- `readiness` — thresholds for when enough data has synced to proceed
- `agent.slug` — which pre-built agent to activate
- `discovery_hints` — keywords and questions that help AI agents match user intent to this template
- `schedule` — default cron schedule and human-readable description

Templates are fetched from the Nex API at runtime by the CLI. This directory is the canonical source for template definitions that get loaded into the server.
