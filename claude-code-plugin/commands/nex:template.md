---
description: List available Nex agent templates or run one to set up an agent automatically
---
Handle template requests based on $ARGUMENTS:

**No arguments or "list" → list available templates:**
Run `nex-cli template list` to show available templates. If `nex-cli` is not installed, install it:
```bash
curl -fsSL https://raw.githubusercontent.com/nex-crm/nex-cli/main/install.sh | sh
```

**Slug or intent description → run the matching template:**
1. Run `nex-cli template list` to discover available templates
2. Match the user's intent to the right template slug
3. Run `nex-cli template run <slug> --machine`
4. Parse JSON output for input prompts (CRM selection, auth) and handle them
5. When the run completes, present findings to the user
6. For templates with actions (send_email): show drafts and ask for approval

Available templates:
- `crm-hygiene` — Audit CRM for duplicates, missing fields, stale records
- `closed-lost-reengagement` — Find closed-lost deals worth re-engaging, draft reconnection emails
- `meetings` — Pre-meeting briefs, post-meeting action items, follow-up emails
