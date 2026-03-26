# Nex: Compounding Intelligence for AI agents

[![npm version](https://img.shields.io/npm/v/@nex-ai/nex)](https://www.npmjs.com/package/@nex-ai/nex)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?logo=discord&logoColor=white)](https://discord.gg/gjSySC3PzV)

Turn all your AI agent conversations into a unified knowledge graph. Supports Claude Code, Codex, OpenClaw, Cursor, OpenCode, etc. Adds additional context from Email, Meetings, Slack, HubSpot, Salesforce.

Tell something to OpenClaw. Ask about it in Claude Code. Reference it from Cursor. Context follows you across tools — no copy-pasting, no re-explaining, no lost context.

<a href="https://discord.gg/gjSySC3PzV"><img src="https://img.shields.io/badge/Join%20our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join our Discord" /></a>

Talk to the team, share feedback, and connect with other developers building AI agents with Nex.

## How It Works

```
You → OpenClaw: "Maria Rodriguez, CTO of TechFlow, wants to expand to Europe in Q3. Budget is $2M."

You → Claude Code: "What do you know about Maria Rodriguez?"
Claude Code: "Maria Rodriguez is the CTO of TechFlow. They're planning European expansion
              in Q3 with a $2M budget."

You → Cursor: "Which companies are planning European expansion?"
Cursor: "TechFlow — Maria Rodriguez (CTO) confirmed Q3 timeline, $2M budget."
```

One fact entered once. Available everywhere, instantly.

## Integration Options

| | CLI + MCP Server | OpenClaw Plugin | Claude Code Plugin | Scripts |
|---|---|---|---|---|
| **Platforms** | Any terminal, Claude Desktop, ChatGPT, Cursor, Windsurf | OpenClaw | Claude Code CLI | OpenClaw (script-based) |
| **Auto-recall** | Via `nex recall` / MCP tool calls | Yes (smart filter) | Yes (smart filter) | No (manual) |
| **Auto-capture** | Via `nex capture` | Yes | Yes | No (manual) |
| **Notifications** | Daily digest + proactive alerts (Channels API) | No | No | No |
| **Commands** | 50+ CLI commands, 50+ MCP tools, `nex mcp` | 4 tools + 4 commands | 5 slash commands + MCP | bash scripts |
| **Setup** | `nex setup` | Copy plugin | `nex setup` | Set `NEX_API_KEY` |

## Quick Start (Recommended)

```bash
# Install and run setup — handles everything in one step
npm install -g @nex-ai/nex
nex setup
```

`nex setup` registers your API key, auto-detects your AI platforms (Claude Code, Cursor, Windsurf, etc.), installs hooks, scans project files, and creates config. One command, fully configured.

```bash
# Now use it from any agent
nex ask "who is Maria Rodriguez?"
nex remember "Met with Maria, CTO of TechFlow. European expansion Q3, $2M budget."
```

## Copy-Paste Prompt For Any AI Agent

Drop this prompt into any terminal-capable AI agent when you want it to bootstrap Nex for you end to end:

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

---

<details>
<summary>Manual setup per platform (if you prefer step-by-step)</summary>

### CLI (any terminal, any AI agent)

```bash
npx @nex-ai/nex register --email you@company.com
```

That's it. Now use it:

```bash
# Ask your knowledge graph
nex ask "who is Maria Rodriguez?"

# Ingest information
nex remember "Met with Maria Rodriguez, CTO of TechFlow. European expansion Q3, $2M budget."

# Or pipe from stdin
cat meeting-notes.txt | nex remember

# Search CRM records
nex search "TechFlow"

# CRUD operations
nex record list person --limit 10
nex task create --title "Follow up with Maria" --priority high
nex insight list --last 24h

# Build auto-recall hooks for any agent
nex recall "what do I know about TechFlow?"  # Returns <nex-context> XML block

# Build auto-capture hooks
nex capture "Agent conversation text..."  # Rate-limited, filtered
```

Install globally: `npm install -g @nex-ai/nex`

### MCP Server (Claude Desktop, Cursor, Windsurf)

The MCP server is bundled inside `@nex-ai/nex`. No separate package needed.

```json
{
  "mcpServers": {
    "nex": {
      "command": "nex-mcp",
      "env": { "NEX_API_KEY": "sk-your_key_here" }
    }
  }
}
```

Or without a global install:

```json
{
  "mcpServers": {
    "nex": {
      "command": "npx",
      "args": ["-y", "@nex-ai/nex", "mcp"],
      "env": { "NEX_API_KEY": "sk-your_key_here" }
    }
  }
}
```

No API key? The server starts in registration mode — call the `register` tool with your email.

### Proactive Notifications (Claude Code Channels)

The MCP server includes a built-in notification channel that pushes context updates directly into your Claude Code session — without you having to ask. This uses the [Claude SDK Channels API](https://code.claude.com/docs/en/channels-reference).

**What you get:**

| Notification | What it does | Frequency |
|---|---|---|
| **Daily digest** | Summarizes all context collected in the last 24 hours: deal updates, new relationships, upcoming events, actionable items | Once per day (on first session start after 24h) |
| **Proactive alerts** | Pushes new insights as they're discovered — deal changes, relationship shifts, risks, opportunities | Every 15 minutes (configurable) |

**How to enable:**

1. Install Nex globally (if not already):
   ```bash
   npm install -g @nex-ai/nex
   ```

2. Add the MCP server to your project (`.mcp.json`):
   ```json
   {
     "mcpServers": {
       "nex": {
         "command": "nex-mcp",
         "env": {}
       }
     }
   }
   ```

3. Start Claude Code with channels enabled:
   ```bash
   claude --dangerously-load-development-channels server:nex
   ```

4. That's it. Notifications arrive as `<channel>` events in your session:
   ```
   ← nex: [technical_stack] MCP server utilizes experimental channel capability...
   ← nex: [deal_update | high] Meridian counter-offer moved to 12% equity split...
   ```

**Configuration:**

| Environment variable | Default | Description |
|---|---|---|
| `NEX_NOTIFY_INTERVAL_MINUTES` | `15` | How often to poll for new insights |

Set it in your `.mcp.json`:
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

**State persistence:** Digest and notification timestamps are stored in `~/.nex/channel-state.json`. Delete this file to force a fresh digest on next session start.

**Requirements:** Claude Code v2.1.80+, claude.ai login (API keys not supported for Channels), `--dangerously-load-development-channels` flag during research preview.

### OpenClaw Plugin (auto-recall + auto-capture)

```bash
cp -r openclaw-plugin /path/to/openclaw/plugins/nex
cd /path/to/openclaw/plugins/nex && bun install && bun run build
```

Add to `openclaw.json`:

```json
{
  "plugins": {
    "load": { "paths": ["/path/to/plugins/nex"] },
    "slots": { "memory": "nex" },
    "entries": {
      "nex": {
        "enabled": true,
        "config": {
          "apiKey": "sk-your_key_here"
        }
      }
    }
  }
}
```

See [`openclaw-plugin/README.md`](openclaw-plugin/README.md) for details.

### Claude Code Plugin (auto-recall + auto-capture)

```bash
cd claude-code-plugin && bun install && bun run build
```

Add hooks to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "NEX_API_KEY=sk-your_key node /path/to/claude-code-plugin/dist/auto-recall.js",
        "timeout": 10000
      }]
    }],
    "Stop": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "NEX_API_KEY=sk-your_key node /path/to/claude-code-plugin/dist/auto-capture.js",
        "timeout": 5000,
        "async": true
      }]
    }]
  }
}
```

Slash commands and MCP server:

```bash
cp claude-code-plugin/commands/*.md ~/.claude/commands/    # /nex:recall, /nex:remember, /nex:scan, /nex:entities
claude mcp add nex -- nex-mcp                               # Full toolset
```

See [`claude-code-plugin/README.md`](claude-code-plugin/README.md) for details.

### Scripts (OpenClaw script-based)

For OpenClaw agents without the plugin, bash scripts provide direct API access:

```bash
# Register and get API key
bash scripts/nex-openclaw-register.sh your@email.com "Your Name"

# Query context
printf '{"query":"who is Maria?"}' | bash scripts/nex-api.sh POST /v1/context/ask

# Ingest text
printf '{"content":"Meeting notes..."}' | bash scripts/nex-api.sh POST /v1/context/text

# Scan project files
bash scripts/nex-scan-files.sh --dir . --max-files 10
```

See the [scripts directory](scripts/) for details.

</details>

## Shared Config

All surfaces share configuration for cross-tool compatibility:

| File | Purpose | Shared by |
|------|---------|-----------|
| `~/.nex-mcp.json` | API key + workspace info | All surfaces |
| `~/.nex/file-scan-manifest.json` | File change tracking | All surfaces |
| `~/.nex/rate-limiter.json` | Rate limit timestamps | OC, MCP, CC |
| `~/.nex/recall-state.json` | Recall debounce state | CC |

Register once via any surface → all other surfaces pick up the key automatically.

## Architecture

```
                    ┌─────────────────────┐
                    │   Nex Context Graph  │
                    │  (people, companies, │
                    │  insights, tasks...) │
                    └──────────┬──────────┘
                               │
      ┌────────────────────────┼────────────────────────┐
      │              │                   │              │
  ┌───▼────┐  ┌─────▼───────┐  ┌───────▼──────┐  ┌───▼──────────┐
  │  CLI   │  │  MCP Server │  │  OpenClaw    │  │  Claude Code │
  │  50+   │  │  50+ tools  │  │  Plugin     │  │  Plugin      │
  │  cmds  │  │  + scan     │  │  + recall   │  │  + recall    │
  └───┬────┘  └─────┬───────┘  └──────┬──────┘  └──────┬───────┘
      │             │                 │                 │
  Any agent    Claude Desktop    OpenClaw agents   Claude Code
  Aider        ChatGPT          Clawgent          Any project
  Codex        Cursor            WhatsApp
  Custom       Windsurf
```

## Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| `NEX_API_KEY` | Yes (or register) | — |
| `NEX_DEV_URL` | No (dev only) | `https://app.nex.ai` |
| `NEX_SCAN_ENABLED` | No | `true` |
| `NEX_SCAN_EXTENSIONS` | No | `.md,.txt,.rtf,.html,.htm,.csv,.tsv,.json,.yaml,.yml,.toml,.xml,.js,.ts,.jsx,.tsx,.py,.rb,.go,.rs,.java,.sh,.bash,.zsh,.fish,.org,.rst,.adoc,.tex,.log,.env,.ini,.cfg,.conf,.properties` |
| `NEX_SCAN_MAX_FILES` | No | `5` |
| `NEX_SCAN_DEPTH` | No | `20` |
| `NEX_SCAN_MAX_FILE_SIZE` | No | `100000` (bytes) |
| `NEX_SCAN_IGNORE_DIRS` | No | `node_modules,.git,dist,build,.next,__pycache__,vendor,.venv,.claude,coverage,.turbo,.cache` |
| `NEX_NOTIFY_INTERVAL_MINUTES` | No | `15` |

## Testing

- **Shims**: `npm test` (syntax validation of bin/ shims)
- **OpenClaw plugin**: `cd openclaw-plugin && npx vitest run`
- **Claude Code plugin**: `cd claude-code-plugin && bun test`

## License

MIT
