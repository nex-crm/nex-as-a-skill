---
description: List, view, generate, activate, run, and manage agents and their findings
---
Handle agent requests based on $ARGUMENTS:

**No arguments → list all agents:**
Use the `list_agents` MCP tool. Display results as a table:
| Name | Slug | Domain | Status | Version | Updated |

**Agent slug → show agent details:**
Use `get_agent` to fetch by ID, or if the argument looks like a slug (contains hyphens, no pure digits), list agents and find the matching one. Display the full agent details including name, domain, goal, spec, status, and version.

**"generate <description>" → create a new agent from a prompt:**
The user describes what they want the agent to do. You (the agent) should:
1. Read workspace context using `query_context` ("what object types exist? what fields are on deals/contacts?")
2. Determine a slug, name, domain, and goal from the description
3. Build a spec object defining what the agent should check/do
4. Call `generate_agent` with the parameters
5. Show the created agent to the user

Example: `/nex:agents generate A CRM hygiene agent that finds deals missing close dates and contacts without emails`

**"activate <slug>" → activate an agent:**
1. Find the agent by listing and matching the slug
2. Call `activate_agent` with the agent ID
3. Download the agent spec and save it as a Claude Code markdown file at `.claude/agents/<slug>.md` so it can be referenced locally
4. Confirm activation to the user

**"run <slug>" → trigger an agent run:**
1. Find the agent by listing and matching the slug
2. Call `run_agent` with the agent ID
3. Display the run ID and initial status
4. Poll `get_agent_runs` every few seconds until the run completes (status is done, failed, or completed_with_errors)
5. When complete, show the summary and findings count

**"runs <slug>" → show run history:**
1. Find the agent by listing and matching the slug
2. Call `get_agent_runs` with the agent ID
3. Display results as a table:
| Run ID | Status | Trigger | Started | Completed | Findings |

**"findings <slug>" → show pending findings for review:**
1. Find the agent by listing and matching the slug
2. Call `get_agent_findings` with the agent ID and status=pending
3. Display each finding with:
   - Title, severity, confidence
   - Description and evidence
   - Recommended action
4. For each finding, ask the user: **Approve** or **Reject**?
5. Call `approve_finding` or `reject_finding` based on user choice
6. Continue until all pending findings are reviewed

**"findings <slug> all" → show all findings (not just pending):**
Same as above but without status filter. Do not prompt for approve/reject on already-finalized findings.
