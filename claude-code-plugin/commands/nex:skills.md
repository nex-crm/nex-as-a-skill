---
description: List, view, compile, generate, update, sync, download, and read agent skills
---
Handle skill requests based on $ARGUMENTS:

**No arguments → list all skills:**
Use the `list_skills` MCP tool. Display results as a table:
| Name | Trigger | Confidence | Updated |

**Skill slug → show skill:**
Use `get_skill_by_slug` with the slug. Display the full markdown content including trigger condition, action steps, required integrations, and workspace context.

**"sync" → sync all skills to local .nex/skills/ folder:**
Use `sync_skills`. Downloads all skills as .md files for fast local access. Structure:
```text
.nex/skills/
  jolt-indecision-recovery.md
  insight-led-pitch-generation.md
  accelerate-deal-timeline.md
```

**"generate <description>" → create a new skill from a prompt:**
The user describes what they want the skill to do. You (the agent) should:
1. Read workspace context using `query_context` ("what integrations are connected? what CRM fields exist?")
2. Use `search_entities` to identify any specific people, companies, or deals involved
3. Generate the full skill markdown with YAML frontmatter (name, trigger, confidence, tools, composio_actions, composio_triggers, required_integrations) and action steps
4. Call `generate_skill` with the slug, title, summary, and content
5. Show the created skill to the user

Example: `/nex:skills generate When a deal goes stale for 2 weeks, research the company and draft a re-engagement email`

**"compile" → trigger skill compilation:**
Use `compile_skills`. Scans playbook rules and generates executable skills grounded to the workspace's connected tools, team members, and CRM schema.

**"download <id>" → download as markdown:**
Use `download_skill` with the ID. Display the raw markdown with YAML frontmatter.

**"update <slug>" → improve an existing skill:**
First use `get_skill_by_slug` with the slug to find the skill ID and current content. Then call `update_skill` with either a full replacement `content` or a targeted `patch`. Show the updated skill to the user.

**"read <slug>" → read from local .nex/skills/ folder:**
Use `read_skill` with the slug. Reads locally first (zero API cost), falls back to API.
