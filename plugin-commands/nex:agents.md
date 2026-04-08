---
description: List, view, compile, generate, update, sync, activate, run, and review agents
---
Handle agent requests based on $ARGUMENTS:

**No arguments → list all agents:**
Use the `list_agents` MCP tool. Display results as a table:
| Name | Slug | Domain | Status | Version | Updated |

**Agent slug → show agent details:**
Use `get_agent_by_slug` with the slug. Display the full agent details including name, domain, goal, spec, status, and version.

**"sync" → sync all agents to local .claude/agents/ folder:**
Use `sync_agents`. Downloads all non-archived agents as Claude Code markdown files. Structure:
```text
.claude/agents/
  crm-hygiene.md
  sales-pipeline-strategist.md
  customer-retention.md
```

**"read <slug>" → read a synced agent locally:**
Use `read_agent` with the slug. Reads locally first (zero API cost), falls back to the API-rendered Claude markdown.

**"generate <description>" → create a new agent from a prompt:**
The user describes what they want the agent to do. You should:
1. Read workspace context using `query_context` and any relevant record tools
2. Determine whether this should be a prompt-generated agent, a built-in template, or a manual spec
3. Call `generate_agent`
4. Show the created agent to the user

Example: `/nex:agents generate A customer retention agent that watches stale renewal deals and drafts recovery actions`

**"compile" → compile or refresh compiled agents:**
Use `compile_agents`. This updates existing compiled agents in place when their generated definition changes.

**"update <slug>" → improve an existing agent:**
First use `get_agent_by_slug` with the slug to find the agent ID and current definition. Then call `update_agent` with any changed `name`, `domain`, `goal`, or `spec`. Show the updated agent to the user.

**"activate <slug>" → activate an agent:**
1. Find the agent with `get_agent_by_slug`
2. Call `activate_agent` with the agent ID
3. Confirm activation and note that the Claude markdown was refreshed locally when Claude output was requested

**"run <slug>" → trigger an agent run:**
1. Find the agent with `get_agent_by_slug`
2. Call `run_agent` with the agent ID
3. Display the run ID and initial status
4. Poll `get_agent_runs` until the run completes
5. When complete, show the summary and findings count

**"runs <slug>" → show run history:**
1. Find the agent with `get_agent_by_slug`
2. Call `get_agent_runs` with the agent ID
3. Display results as a table:
| Run ID | Status | Trigger | Started | Completed | Findings |

**"findings <slug>" → show pending findings for review:**
1. Find the agent with `get_agent_by_slug`
2. Call `get_agent_findings` with `status=pending`
3. Display each finding with title, severity, confidence, description, evidence, and recommended action
4. For each finding, ask the user: **Approve** or **Reject**?
5. Call `approve_finding` or `reject_finding` based on the user's choice

**"findings <slug> all" → show all findings:**
Same as above but without the pending-only filter. Do not prompt for approve/reject on already-finalized findings.
