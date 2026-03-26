# Nex: Compounding Intelligence for AI Agents

[![npm version](https://img.shields.io/npm/v/@nex-ai/nex)](https://www.npmjs.com/package/@nex-ai/nex)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?logo=discord&logoColor=white)](https://discord.gg/gjSySC3PzV)

Nex turns AI agent conversations into a unified knowledge graph. Tell something to one agent, recall it from any other. Context follows you across tools — no copy-pasting, no re-explaining.

Supports Claude Code, OpenClaw, Cursor, Windsurf, Codex, Aider, Continue, Zed, and more. Adds context from Email, Meetings, Slack, HubSpot, Salesforce.

## What's in this repo

This repo is the **public integration layer** for Nex. It contains the npm package, platform plugins, agent instructions, and slash commands. The heavy lifting happens in the [`nex-cli`](https://github.com/nex-crm/nex-cli) binary, which is installed separately.

```
bin/                    # Thin Node.js shims that delegate to nex-cli
claude-code-plugin/     # Claude Code hooks (auto-recall, auto-capture, slash commands)
openclaw-plugin/        # OpenClaw plugin (15+ tools, auto-recall, auto-capture)
plugin-commands/        # Slash command definitions (.md files)
platform-rules/         # Agent instructions for 10 platforms (Cursor, Windsurf, Zed, etc.)
platform-plugins/       # Editor integrations (Continue, OpenCode, KiloCode, Windsurf workflows)
scripts/                # Bash API wrappers for shell-only agents
server.json             # MCP Registry manifest
```

## Quick Start

```bash
npm install -g @nex-ai/nex
nex setup
```

`nex setup` registers your API key, detects your AI platforms, installs hooks, scans project files, and writes config. After setup:

```bash
nex ask "who is Maria Rodriguez?"
nex remember "Met with Maria, CTO of TechFlow. European expansion Q3, $2M budget."
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

## Platform Setup

### Claude Code

The fastest path is `nex setup` — it auto-configures hooks, MCP, and slash commands.

For manual setup, see [`claude-code-plugin/README.md`](claude-code-plugin/README.md). In short:

```bash
cd claude-code-plugin && bun install && bun run build
```

Then add hooks to `~/.claude/settings.json` (see [`settings.json`](claude-code-plugin/settings.json) for the template) and copy slash commands:

```bash
cp claude-code-plugin/commands/*.md ~/.claude/commands/
claude mcp add nex -- nex-mcp
```

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

### OpenClaw

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

### Other Platforms

Copy the relevant rule file from [`platform-rules/`](platform-rules/) into your editor's config:

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

### Shell-only Agents (no Node.js)

```bash
# Register
bash scripts/nex-openclaw-register.sh your@email.com "Your Name"

# Query
printf '{"query":"who is Maria?"}' | bash scripts/nex-api.sh POST /v1/context/ask

# Ingest
printf '{"content":"Meeting notes..."}' | bash scripts/nex-api.sh POST /v1/context/text

# Scan files
bash scripts/nex-scan-files.sh --dir . --max-files 10
```

Requires `curl` and `jq`.

## Development

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

The `@nex-ai/nex` npm package is a thin shim. `bin/nex.js` and `bin/nex-mcp.js` look for the `nex-cli` binary on your PATH (or `~/.local/bin/nex-cli`) and forward all arguments. If it's not found, they print install instructions:

```bash
curl -fsSL https://raw.githubusercontent.com/nex-crm/nex-cli/main/install.sh | sh
```

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
