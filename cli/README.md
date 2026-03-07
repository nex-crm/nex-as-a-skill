# nex-ai

Nex CLI provides organizational context & memory to AI agents across 10+ platforms.

## Install

```bash
# Install globally
npm install -g nex-ai

# Or run directly (no install)
npx nex-ai ask "who is Maria?"
```

## Quick Start

```bash
# 1. Register for an API key
nex-ai register --email you@company.com

# 2. Set up your platforms (auto-detects installed tools)
nex-ai setup

# 3. Query your knowledge
nex-ai ask "what's the latest on the Acme deal?"
```

## Supported Platforms

`nex-ai setup` auto-detects and configures these platforms:

| Platform | Detection | Integration |
|----------|-----------|-------------|
| **Claude Code** | `~/.claude/` | Hooks (auto-recall, auto-capture, session start) + slash commands + MCP |
| **Claude Desktop** | App config exists | MCP server |
| **Cursor** | `~/.cursor/` | MCP server |
| **VS Code (Copilot)** | `which code` or `.vscode/` | MCP server (workspace-level) |
| **Windsurf** | `~/.codeium/windsurf/` | MCP server |
| **Cline** | VS Code extension installed | MCP server (globalStorage config) |
| **Continue.dev** | `.continue/` or `~/.continue/` | MCP server |
| **Zed** | `~/.config/zed/` | MCP server (context_servers) |
| **Kilo Code** | `.kilocode/` in project | MCP server |
| **OpenCode** | `~/.config/opencode/` | MCP server |

All MCP-based platforms use the same server entry:

```json
{
  "nex": {
    "command": "npx",
    "args": ["-y", "@nex-crm/mcp-server"],
    "env": { "NEX_API_KEY": "sk-..." }
  }
}
```

## Setup Command

```bash
nex-ai setup                          # Auto-detect platforms, install Claude Code plugin, create .nex.toml
nex-ai setup --with-mcp               # Also write MCP config to all detected platforms
nex-ai setup --platform cursor        # Install for a specific platform only
nex-ai setup --no-plugin              # Only create config files, skip hooks/commands
nex-ai setup status                   # Show all platforms, install status, and connections
```

**Default behavior** (no flags):
- Claude Code: installs hooks + slash commands (no MCP — avoids filling context windows)
- Other platforms: detected but MCP not written until `--with-mcp` is passed
- Creates `.nex.toml` project config with commented defaults
- Syncs API key to `~/.nex-mcp.json` (shared config)

> **Tip:** AI agents don't automatically know about Nex. Explicitly tell your agent to "use Nex for context and memory" in your prompts or CLAUDE.md instructions.

## Project Config: `.nex.toml`

Per-project settings file created by `nex-ai setup`. All fields are optional.

```toml
[auth]
# api_key = "sk-..."          # Prefer NEX_API_KEY env var or ~/.nex/config.json

[hooks]
# enabled = true              # Master kill switch for all hooks

[hooks.recall]
# enabled = true              # Auto-recall context on each prompt
# debounce_ms = 30000

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
# max_files = 5
# max_file_size = 100000
# depth = 2

[mcp]
# enabled = false             # Set to true by `nex-ai setup --with-mcp`

[output]
# format = "text"             # "text" | "json"
# timeout = 120000
```

**Resolution order:** CLI flags > `.nex.toml` > env vars > `~/.nex/config.json` > defaults

## Commands

### Knowledge Graph

```bash
nex-ai ask <query>              # Query with natural language
nex-ai remember <content>       # Ingest text (meeting notes, emails, docs)
nex-ai recall <query>           # Query → XML-wrapped for agent injection
nex-ai capture [content]        # Rate-limited ingestion for agent hooks
nex-ai artifact <id>            # Check processing status
nex-ai search <query>           # Search CRM records by name
nex-ai insight list [--last 24h]  # Recent insights
```

### Integrations

```bash
nex-ai integrate list                        # Show all integrations with connection status
nex-ai integrate connect email google        # Connect Gmail via OAuth
nex-ai integrate connect messaging slack     # Connect Slack
nex-ai integrate disconnect <id>             # Disconnect by connection ID
```

Supported providers: Gmail, Google Calendar, Outlook, Outlook Calendar, Slack, Attio, HubSpot, Salesforce.

### CRM Records

```bash
nex-ai object list              # List object types (person, company, deal)
nex-ai record list person --limit 10
nex-ai record create person --data '{"name":"Jane Doe"}'
nex-ai record upsert person --match email --data '{"name":"Jane","email":"jane@co.com"}'
nex-ai record update <id> --data '{"phone":"+1234"}'
nex-ai record delete <id>
nex-ai record timeline <id>
```

### Tasks & Notes

```bash
nex-ai task create --title "Follow up" --priority high --due 2026-04-01
nex-ai task list --assignee me --search "follow up"
nex-ai task update <id> --completed
nex-ai note create --title "Call notes" --content "..." --entity <record-id>
```

### Relationships & Lists

```bash
nex-ai rel list-defs
nex-ai rel create <record-id> --def <def-id> --entity1 <id1> --entity2 <id2>
nex-ai list list person
nex-ai list add-member <list-id> --parent <record-id>
nex-ai list-job create "enterprise contacts in EMEA"
```

### File Scanning

On session start, Nex automatically scans project files and ingests changed content.

**Default text-based extensions:** `.md`, `.txt`, `.csv`, `.json`, `.yaml`, `.yml`

**Document formats** (handled separately): `.docx`, `.doc`, `.odt`, `.xlsx`, `.xls`, `.pptx`, `.ppt`, `.pdf`

Configure via `.nex.toml` `[scan]` section or environment variables (`NEX_SCAN_ENABLED`, `NEX_SCAN_EXTENSIONS`, etc.).

### Config & Sessions

```bash
nex-ai config show              # Resolved config (key masked)
nex-ai config set default_format text
nex-ai config path              # ~/.nex/config.json
nex-ai session list             # Stored session mappings
nex-ai session clear
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
cat meeting-notes.txt | nex-ai remember
echo "what happened today?" | nex-ai ask
git diff | nex-ai capture
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error (server error, rate limit, invalid input) |
| 2 | Auth error (no API key, invalid key, 401/403) |

## Development

```bash
npm install
npm run build     # TypeScript → dist/
npm run dev       # Run with tsx (no build)
npm test          # Unit tests
NEX_DEV_URL=http://localhost:30000 nex-ai ask "test"  # Local API
```
