# Nex: Compounding Intelligence for AI Agents

[![npm version](https://img.shields.io/npm/v/@nex-ai/nex)](https://www.npmjs.com/package/@nex-ai/nex)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?logo=discord&logoColor=white)](https://discord.gg/gjSySC3PzV)

Nex turns AI agent conversations into a unified knowledge graph. Tell something to one agent, recall it from any other. Context follows you across tools — no copy-pasting, no re-explaining.

Supports Claude Code, OpenClaw, Cursor, Windsurf, Codex, Aider, Continue, Zed, and more. Adds context from Email, Meetings, Slack, HubSpot, Salesforce.

<a href="https://discord.gg/gjSySC3PzV"><img src="https://img.shields.io/badge/Join%20our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join our Discord" /></a>

Talk to the team, share feedback, and connect with other developers building AI agents with Nex.

## Quick Start

### Install

```bash
# Option A: install the nex-cli binary directly
curl -fsSL https://raw.githubusercontent.com/nex-crm/nex-cli/main/install.sh | sh

# Option B: install via npm (or bun/pnpm)
npm install -g @nex-ai/nex
```

### Sign up and configure

```bash
# Create an account (or log in if you already have one)
nex register --email you@company.com

# Auto-detect your AI platforms and install hooks, MCP, slash commands
nex setup
```

`nex setup` detects your platforms (Claude Code, Cursor, Windsurf, etc.), installs hooks, scans project files, and writes config. After setup:

```bash
nex ask "who is Maria Rodriguez?"
nex remember "Met with Maria, CTO of TechFlow. European expansion Q3, $2M budget."
```

## Skills & Platform Rules

The core of this repo is a set of skills, slash commands, and agent instructions that teach any AI platform how to use Nex.

### Slash Commands (`plugin-commands/`)

Drop these `.md` files into your agent's commands directory to get Nex slash commands:

| Command | What it does |
|---------|-------------|
| `/nex:recall <query>` | Search your knowledge base |
| `/nex:remember <text>` | Store information for later recall |
| `/nex:entities <query>` | Find people, companies, topics |
| `/nex:scan <dir>` | Scan project files into Nex |
| `/nex:integrate <provider>` | Connect an OAuth integration |
| `/nex:register <email>` | One-time account registration |
| `/nex:notify` | Check recent notifications |

For Claude Code: `cp plugin-commands/*.md ~/.claude/commands/`

### Platform Rules (`platform-rules/`)

Pre-written agent instructions that teach each platform how to use Nex tools. Copy the relevant file into your editor's config:

| Platform | File | Destination |
|----------|------|-------------|
| Cursor | `cursor-rules.md` | `.cursor/rules/` |
| Windsurf | `windsurf-rules.md` | `.windsurf/rules/` |
| VS Code | `vscode-instructions.md` | `.github/instructions/` |
| Zed | `zed-rules.md` | `.zed/rules/` |
| Aider | `aider-conventions.md` | `.aider/conventions/` |
| Cline | `cline-rules.md` | `.cline/rules/` |
| Continue | `continue-rules.md` | `.continue/rules/` |
| KiloCode | `kilocode-rules.md` | `.kilocode/rules/` |
| Codex | `codex-agents.md` | `.codex/agents/` |
| OpenCode | `opencode-agents.md` | `.opencode/agents/` |

### Platform Plugins (`platform-plugins/`)

Deeper integrations for editors that support plugin APIs:

- **Continue** (`continue-provider.ts`) — Nex as a context provider for autocomplete
- **OpenCode** (`opencode-plugin.ts`) — Session lifecycle hooks for context preservation
- **KiloCode** (`kilocode-modes.yaml`) — Nex memory mode definitions
- **Windsurf** (`windsurf-workflows/`) — Native workflow definitions for ask, remember, search, notify

## Plugins

### Claude Code Plugin

Full auto-recall and auto-capture via Claude Code hooks. Queries Nex before each prompt and captures conversation facts after each response.

```bash
cd claude-code-plugin && bun install && bun run build
```

Then add hooks to `~/.claude/settings.json` (see [`settings.json`](claude-code-plugin/settings.json) for the template) and register the MCP server:

```bash
cp claude-code-plugin/commands/*.md ~/.claude/commands/
claude mcp add nex -- nex-mcp
```

The fastest path is just `nex setup` — it does all of this automatically.

See [`claude-code-plugin/README.md`](claude-code-plugin/README.md) for details.

### OpenClaw Plugin

15+ tools, auto-recall, and auto-capture for OpenClaw agents.

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
        "config": { "apiKey": "sk-your_key_here" }
      }
    }
  }
}
```

See [`openclaw-plugin/README.md`](openclaw-plugin/README.md) for details.

### MCP Server (Claude Desktop, Cursor, Windsurf)

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

### Shell-only Agents (no Node.js)

Bash scripts for agents that can only run shell commands. Requires `curl` and `jq`.

```bash
bash scripts/nex-openclaw-register.sh your@email.com "Your Name"
printf '{"query":"who is Maria?"}' | bash scripts/nex-api.sh POST /v1/context/ask
bash scripts/nex-scan-files.sh --dir . --max-files 10
```

## Copy-Paste Bootstrap Prompt

Drop this into any terminal-capable AI agent to bootstrap Nex end to end:

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

## Development

### Repo structure

```
bin/                    # Thin Node.js shims that delegate to nex-cli
claude-code-plugin/     # Claude Code hooks (auto-recall, auto-capture)
openclaw-plugin/        # OpenClaw plugin (15+ tools, auto-recall, auto-capture)
plugin-commands/        # Slash command definitions (.md files)
platform-rules/         # Agent instructions for 10 platforms
platform-plugins/       # Editor integrations (Continue, OpenCode, KiloCode, Windsurf)
scripts/                # Bash API wrappers for shell-only agents
server.json             # MCP Registry manifest
```

### Build and test

```bash
# Shims (syntax check only)
npm test

# Claude Code plugin
cd claude-code-plugin && bun install && bun run build && bun test

# OpenClaw plugin
cd openclaw-plugin && bun install && bun run build && bun test
```

### How the npm package works

The `@nex-ai/nex` npm package is a thin shim. `bin/nex.js` and `bin/nex-mcp.js` look for the `nex-cli` binary on your PATH (or `~/.local/bin/nex-cli`) and forward all arguments. If it's not found, they print install instructions.

### CI/CD

- **CI** (`ci.yml`): Validates shims, builds + tests both plugins on every PR
- **Publish** (`publish-cli.yml`): Auto-publishes to npm on push to main (when `bin/`, `plugin-commands/`, `platform-rules/`, `platform-plugins/`, or `package.json` change)
- **MCP Registry** (`publish-mcp.yml`): Publishes `server.json` to the MCP Registry on version tags

## Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| `NEX_API_KEY` | Yes (or register) | — |
| `NEX_DEV_URL` | No (dev only) | `https://app.nex.ai` |
| `NEX_SCAN_ENABLED` | No | `true` |
| `NEX_SCAN_MAX_FILES` | No | `5` |
| `NEX_SCAN_DEPTH` | No | `20` |
| `NEX_NOTIFY_INTERVAL_MINUTES` | No | `15` |

## Architecture

```
                    ┌─────────────────────┐
                    │   Nex Context Graph  │
                    │  (app.nex.ai API)    │
                    └──────────┬──────────┘
                               │
      ┌────────────────────────┼────────────────────────┐
      │              │                   │              │
  ┌───▼────┐  ┌─────▼───────┐  ┌───────▼──────┐  ┌───▼──────────┐
  │nex-cli │  │  MCP Server │  │  OpenClaw    │  │  Claude Code │
  │ binary │  │  (nex-mcp)  │  │  Plugin     │  │  Plugin      │
  └───┬────┘  └─────┬───────┘  └──────┬──────┘  └──────┬───────┘
      │             │                 │                 │
  Any terminal  Claude Desktop   OpenClaw agents   Claude Code
  + this npm    Cursor, Windsurf
    package     ChatGPT
```

## License

MIT
