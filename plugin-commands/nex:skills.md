---
description: List, view, compile, and sync agent skills
---
Handle skill requests based on $ARGUMENTS:

**No arguments → list all skills:**
Use the `list_skills` MCP tool. Display results as a table:
| Name | Trigger | Confidence | Updated |

**Skill slug → show skill:**
Use `get_skill_by_slug` with the slug. Display the full markdown content including trigger condition, action steps, required integrations, and workspace context.

**"sync" → sync all skills to local .nex/skills/ folder:**
Use `sync_skills`. Downloads all skills as .md files for fast local access. Structure:
```
.nex/skills/
  jolt-indecision-recovery.md
  insight-led-pitch-generation.md
  accelerate-deal-timeline.md
```

**"compile" → trigger skill compilation:**
Use `compile_skills`. Scans playbook rules and generates executable skills grounded to the workspace's connected tools, team members, and CRM schema.

**"download <id>" → download as markdown:**
Use `download_skill` with the ID. Display the raw markdown with YAML frontmatter.

**"read <slug>" → read from local .nex/skills/ folder:**
Use `read_skill` with the slug. Reads locally first (zero API cost), falls back to API.
