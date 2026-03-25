# Nex: Compounding Intelligence for AI agents

[![npm version](https://img.shields.io/npm/v/@nex-ai/nex)](https://www.npmjs.com/package/@nex-ai/nex)
[![GitHub](https://img.shields.io/badge/github-nex--crm%2Fnex--as--a--skill-blue)](https://github.com/nex-crm/nex-as-a-skill)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?logo=discord&logoColor=white)](https://discord.gg/gjSySC3PzV)

Turn all your AI agent conversations into a unified knowledge graph with proactive context surfacing. Supports Claude Code, Codex, OpenClaw, Cursor, OpenCode, etc. Adds additional context from Email, Meetings, Slack, HubSpot, Salesforce.

<a href="https://discord.gg/gjSySC3PzV"><img src="https://img.shields.io/badge/Join%20our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join our Discord" /></a>

Talk to the team, share feedback, and connect with other developers building AI agents with Nex.

**GitHub**: [github.com/nex-crm/nex-as-a-skill](https://github.com/nex-crm/nex-as-a-skill)

## Install

```bash
# Install globally
npm install -g @nex-ai/nex

# Or run directly (no install)
npx @nex-ai/nex ask "who is Maria?"
```

## Quick Start (Recommended)

```bash
# One command to get started — registers, detects platforms, installs hooks, scans files
nex setup
```

`nex setup` handles the base install flow: API key registration or re-keying, platform detection, platform installation, optional first integration connection, file scanning, and config creation.

```bash
# Now query your knowledge
nex ask "what's the latest on the Acme deal?"
```

## Copy-Paste Prompt For Any AI Agent

Use this when you want Claude, Codex, Cursor, OpenCode, or another terminal-capable AI agent to do the full Nex bootstrap for you.

```text
Install and fully bootstrap Nex in this project from start to finish.

1. If the `nex` CLI is missing, install it globally with `npm install -g @nex-ai/nex`.
2. If Nex is not authenticated yet, ask me for the email address I want to use for registration, then continue. If Nex is already authenticated, reuse the existing account and key.
3. Run `nex setup` and complete the full install flow for every detected AI coding platform in this environment.
4. After setup, inspect integrations and connect the first available unconnected integration. Prefer this order when multiple choices are available: gmail, google-calendar, slack, salesforce, hubspot, attio, outlook, outlook-calendar. If OAuth is required, open the browser flow and wait for it to complete.
5. Run a fresh file scan for the current directory so the workspace is up to date.
6. After the scan finishes, trigger Nex compounding jobs by calling the authenticated `POST https://app.nex.ai/api/developers/v1/compounding/trigger` endpoint for these job types: `consolidation`, `pattern_detection`, and `playbook_synthesis`. Use the active Nex API key from the current environment or the config written by Nex setup.
7. Fetch the last 24 hours of insights with the insights endpoint or `nex insight list --last 24h`, then give me a clean digest with sections for Highlights, Risks, Opportunities, Open Loops, and Recommended Next Actions.
8. Finish by showing me:
   - what Nex installed
   - which integration was connected
   - how many files were scanned and ingested
   - whether the compounding/playbooks trigger succeeded
   - the formatted 24-hour insight digest

Do not stop after partial setup. Only pause if you need my email for registration or if an OAuth flow requires my interaction.
```

This works best in agents that can run shell commands and open OAuth URLs.

<details>
<summary>Manual setup (if you prefer step-by-step)</summary>

```bash
# 1. Register for an API key
nex register --email you@company.com

# 2. Set up your platforms (auto-detects installed tools)
nex setup

# 3. Query your knowledge
nex ask "what's the latest on the Acme deal?"
```

</details>

## Supported Platforms

`nex setup` auto-detects and configures these platforms with full-depth integration:

| Platform | Hooks | Plugins | Agents | Workflows | Rules | MCP |
|----------|-------|---------|--------|-----------|-------|-----|
| **Claude Code** | SessionStart, UserPromptSubmit, Stop | — | — | 26 slash commands | — | — |
| **Cursor** | sessionStart, userPromptSubmit, stop | — | — | — | `.cursor/rules/nex.md` | `~/.cursor/mcp.json` |
| **Windsurf** | pre_user_prompt, post_cascade_response | — | — | /nex-ask, /nex-remember, /nex-search | `.windsurf/rules/nex.md` | `mcp_config.json` |
| **Cline** | UserPromptSubmit, TaskStart, TaskComplete | — | — | — | `.clinerules/nex.md` | `cline_mcp_settings.json` |
| **OpenClaw** | auto-recall, auto-capture (plugin) | `openclaw plugins install` (49 tools) | — | — | — | — |
| **OpenCode** | — | `.opencode/plugins/nex.ts` | — | — | `AGENTS.md` | `opencode.json` |
| **VS Code** | — | — | `.github/agents/nex.agent.md` | — | `.github/instructions/` | `.vscode/mcp.json` |
| **Kilo Code** | — | — | `.kilocodemodes` | — | `.kilocode/rules/nex.md` | `.kilocode/mcp.json` |
| **Continue.dev** | — | — | — | — | `.continue/rules/nex.md` | `mcp.json` |
| **Zed** | — | — | — | — | `.rules` | `settings.json` |
| **Claude Desktop** | — | — | — | — | — | `claude_desktop_config.json` |
| **Aider** | — | — | — | — | `CONVENTIONS.md` | — |

All MCP-based platforms use the same server entry (bundled in this package):

```json
{
  "nex": {
    "command": "nex-mcp",
    "env": { "NEX_API_KEY": "sk-..." }
  }
}
```

Or without a global install: `"command": "npx", "args": ["-y", "@nex-ai/nex", "mcp"]`

## Setup Command

```bash
nex setup                          # Auto-detect platforms, install full stack, scan files, create .nex.toml
nex setup --platform cursor        # Install for a specific platform only
nex setup --no-hooks               # Skip hook installation for all platforms
nex setup --no-plugin              # Skip hooks/commands (alias for --no-hooks)
nex setup --no-rules               # Skip rules/instruction file installation
nex setup --no-scan                # Skip file scanning during setup
nex setup status                   # Show all platforms, install status, and connections
nex graph                          # Open the workspace graph in your browser
```

**Default behavior** (no flags):
- If no API key exists: prompts to register
- If API key exists: offers to regenerate (picks up latest scopes) or change email
- Installs the full 6-layer hierarchy for each detected platform: hooks → plugins → agents → workflows → rules → MCP
- Scans current directory and ingests new/changed files into Nex
- Creates `.nex.toml` project config with commented defaults
- Stores config in `~/.nex/config.json`

**Single install**: `npm install -g @nex-ai/nex` bundles everything — hooks, adapters, platform plugins, slash commands, rules, MCP server, and notification channel. No separate packages needed.

**Integration hierarchy** (per platform): Hooks > Custom plugins > Custom agents/modes > Workflows > Rules > MCP. Each platform gets every layer it supports.

## Project Config: `.nex.toml`

Per-project settings file created by `nex setup`. All fields are optional.

```toml
[auth]
# api_key = "sk-..."          # Prefer NEX_API_KEY env var or ~/.nex/config.json

[hooks]
# enabled = true              # Master kill switch for all hooks

[hooks.recall]
# enabled = true              # Proactive context on every prompt
# debounce_ms = 10000

[hooks.capture]
# enabled = true              # Auto-capture on conversation stop
# min_length = 20
# max_length = 50000

[hooks.session_start]
# enabled = true              # Load context on session start

[scan]
# enabled = true
# extensions = [".md", ".txt", ".csv", ".json", ".yaml", ".yml"]
# ignore_dirs = ["node_modules", ".git", "dist", "build", "__pycache__"]
# max_files = 1000
# max_file_size = 100000
# depth = 2

[mcp]
# enabled = false             # Set to true when `nex setup` installs MCP for this project/platform

[output]
# format = "text"             # "text" | "json"
# timeout = 120000
```

**Resolution order:** CLI flags > `.nex.toml` > env vars > `~/.nex/config.json` > defaults

## Commands

### Knowledge Graph

```bash
nex ask <query>              # Query with natural language
nex remember <content>       # Ingest text (meeting notes, emails, docs)
nex recall <query>           # Query → XML-wrapped for agent injection
nex capture [content]        # Rate-limited ingestion for agent hooks
nex artifact <id>            # Check processing status
nex search <query>           # Search CRM records by name
nex insight list [--last 24h]  # Recent insights
nex graph                    # Visualize your workspace graph in the browser
```

### Integrations

```bash
nex integrate list                  # Show all integrations with connection status
nex integrate connect gmail         # Connect Gmail via OAuth
nex integrate connect slack         # Connect Slack
nex integrate disconnect <id>      # Disconnect by connection ID
```

Available integrations: `gmail`, `google-calendar`, `outlook`, `outlook-calendar`, `slack`, `salesforce`, `hubspot`, `attio`.

### CRM Records

```bash
nex object list              # List object types (person, company, deal)
nex record list person --limit 10
nex record create person --data '{"name":"Jane Doe"}'
nex record upsert person --match email --data '{"name":"Jane","email":"jane@co.com"}'
nex record update <id> --data '{"phone":"+1234"}'
nex record delete <id>
nex record timeline <id>
```

### Tasks & Notes

```bash
nex task create --title "Follow up" --priority high --due 2026-04-01
nex task list --assignee me --search "follow up"
nex task update <id> --completed
nex note create --title "Call notes" --content "..." --entity <record-id>
```

### Relationships & Lists

```bash
nex rel list-defs
nex rel create <record-id> --def <def-id> --entity1 <id1> --entity2 <id2>
nex list list person
nex list add-member <list-id> --parent <record-id>
nex list-job create "enterprise contacts in EMEA"
```

### File Scanning

On session start, Nex automatically scans project files and ingests changed content using concurrent workers (5 parallel requests). After ingestion, compounding intelligence jobs are triggered automatically to generate patterns and playbook rules.

```bash
nex scan                    # Scan current directory (up to 1000 files)
nex scan --max-files 500    # Limit files per scan
nex scan --force            # Re-scan all files (ignore manifest)
nex scan --dry-run          # Preview what would be scanned
```

**Default text-based extensions:** `.md`, `.txt`, `.csv`, `.json`, `.yaml`, `.yml`

**Document formats** (handled separately): `.docx`, `.doc`, `.odt`, `.xlsx`, `.xls`, `.pptx`, `.ppt`, `.pdf`

Configure via `.nex.toml` `[scan]` section or environment variables (`NEX_SCAN_ENABLED`, `NEX_SCAN_EXTENSIONS`, etc.).

### Proactive Context

Nex surfaces relevant knowledge graph context on every prompt — not just questions. When you say "fix the migration script" or "deploy to staging", the system automatically injects entity insights, knowledge insights, and playbook patterns from your knowledge graph.

Context is injected as `<nex-context>` blocks that AI agents use naturally without explicitly referencing the source. Only trivial inputs (yes/ok/lgtm) are skipped.

### Transcript Capture

At session end, the full conversation transcript is automatically ingested into the knowledge graph. This captures complete decision trails, code discussions, and debugging sessions — not just the last message.

### MCP Server & Notifications

```bash
nex mcp                         # Start the embedded MCP server (stdio)
MCP_TRANSPORT=http nex mcp      # Start with HTTP transport
```

#### Proactive Notifications (Claude Code Channels)

The MCP server pushes context updates directly into your Claude Code session using the [Channels API](https://code.claude.com/docs/en/channels-reference). No polling commands needed — insights arrive automatically while you work.

**Two notification types:**

- **Daily digest** — Comprehensive summary of all context collected in the last 24 hours (deal changes, new relationships, upcoming events, actionable items). Fires once per day on session start.
- **Proactive alerts** — New insights pushed every 15 minutes: relationship changes, deal updates, risks, opportunities. Configurable via `NEX_NOTIFY_INTERVAL_MINUTES`.

**Quick setup:**

```bash
# 1. Add MCP server to your project
cat > .mcp.json << 'EOF'
{
  "mcpServers": {
    "nex": { "command": "nex-mcp", "env": {} }
  }
}
EOF

# 2. Start Claude Code with channels
claude --dangerously-load-development-channels server:nex
```

Notifications appear as `<channel source="nex">` events in your session. Claude reads them automatically and incorporates the context.

**Customize frequency:**

```json
{
  "mcpServers": {
    "nex": {
      "command": "nex-mcp",
      "env": { "NEX_NOTIFY_INTERVAL_MINUTES": "5" }
    }
  }
}
```

**Force a fresh digest:** `rm ~/.nex/channel-state.json`

**Requirements:** Claude Code v2.1.80+, claude.ai login, `--dangerously-load-development-channels` during research preview.

### Config & Sessions

```bash
nex config show              # Resolved config (key masked)
nex config set default_format text
nex config path              # ~/.nex/config.json
nex session list             # Stored session mappings
nex session clear
```

## Global Flags

```
--api-key <key>     Override API key (env: NEX_API_KEY)
--format <fmt>      json | text (default for integrate list) | quiet
--timeout <ms>      Request timeout (default: 120000)
--session <id>      Session ID for multi-turn context
--debug             Debug output on stderr
```

## Stdin Support

`ask`, `remember`, and `capture` read from stdin when no argument is provided:

```bash
cat meeting-notes.txt | nex remember
echo "what happened today?" | nex ask
git diff | nex capture
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error (server error, rate limit, invalid input) |
| 2 | Auth error (no API key, invalid key, 401/403) |

## Development

```bash
bun install
bun run build     # TypeScript → dist/
bun run dev       # Run TS directly (no build)
bun test          # Unit + integration tests
NEX_DEV_URL=http://localhost:30000 nex ask "test"  # Local API
```
