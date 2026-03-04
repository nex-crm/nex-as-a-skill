# Nex — Cross-Agent Context Layer

Give any AI agent persistent memory. One knowledge graph, every agent.

Tell something to OpenClaw. Ask about it in Claude Code. Reference it from Cursor. Context follows you across tools — no copy-pasting, no re-explaining, no lost context.

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

| | MCP Server | OpenClaw Plugin | Claude Code Plugin | SKILL.md |
|---|---|---|---|---|
| **Platforms** | Claude Desktop, ChatGPT, Cursor, Windsurf | OpenClaw | Claude Code CLI | OpenClaw (script-based) |
| **Auto-recall** | No (tool calls) | Yes (smart filter) | Yes (smart filter) | No (manual) |
| **Auto-capture** | No | Yes | Yes | No (manual) |
| **File scanning** | Yes (tool) | Yes (auto on startup) | Yes (auto on startup) | Yes (script) |
| **Entity search** | Yes (tool) | Yes (tool) | Yes (/entities) | Yes (API pattern) |
| **Tools/Commands** | 50+ typed tools | 4 tools + 4 commands | 5 slash commands + MCP | bash scripts |
| **Rate limiting** | File-based | Queue + file-based | File-based | N/A |
| **Session tracking** | File-based | In-memory LRU | File-based | N/A |
| **Setup** | `npm install` + config | Copy plugin | Build + hooks | Set `NEX_API_KEY` |

## Quick Start

### MCP Server (Claude Desktop, Cursor, Windsurf)

```bash
cd mcp && npm install && npm run build
```

Add to your client config:

```json
{
  "mcpServers": {
    "nex": {
      "command": "npx",
      "args": ["tsx", "/path/to/nex-as-a-skill/mcp/src/index.ts"],
      "env": { "NEX_API_KEY": "sk-your_key_here" }
    }
  }
}
```

No API key? The server starts in registration mode — call the `register` tool with your email.

See [`mcp/README.md`](mcp/README.md) for all tools.

### OpenClaw Plugin (auto-recall + auto-capture)

```bash
cp -r openclaw-plugin /path/to/openclaw/plugins/nex
cd /path/to/openclaw/plugins/nex && npm install && npm run build
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
cd claude-code-plugin && npm install && npm run build
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
cp claude-code-plugin/commands/*.md ~/.claude/commands/    # /recall, /remember, /scan, /entities
claude mcp add nex -- node /path/to/mcp/dist/index.js      # Full toolset
```

See [`claude-code-plugin/README.md`](claude-code-plugin/README.md) for details.

### SKILL.md (OpenClaw script-based)

For OpenClaw agents without the plugin, SKILL.md provides bash-script-based access:

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

See [`SKILL.md`](SKILL.md) for the full API reference.

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
           ┌───────────────────┼───────────────────┐
           │                   │                   │
  ┌────────▼───────┐  ┌───────▼──────┐  ┌─────────▼────────┐
  │  MCP Server    │  │  OpenClaw    │  │  Claude Code     │
  │  (50+ tools)   │  │  Plugin     │  │  Plugin          │
  │  + scan, entity│  │  + scan,    │  │  + scan, recall  │
  │  + rate limit  │  │  recall     │  │  filter, capture │
  │  + sessions    │  │  filter     │  │  + /entities     │
  └────────┬───────┘  └──────┬──────┘  └────────┬─────────┘
           │                 │                   │
  Claude Desktop      OpenClaw agents      Claude Code CLI
  ChatGPT             Clawgent            Any project
  Cursor              WhatsApp
  Windsurf
```

## Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| `NEX_API_KEY` | Yes (or register) | — |
| `NEX_API_BASE_URL` | No | `https://app.nex.ai` |
| `NEX_SCAN_ENABLED` | No | `true` |
| `NEX_SCAN_EXTENSIONS` | No | `.md,.txt,.csv,.json,.yaml,.yml` |
| `NEX_SCAN_MAX_FILES` | No | `5` |
| `NEX_SCAN_DEPTH` | No | `2` |

## Testing

- **OpenClaw plugin**: 38/38 unit tests (`cd openclaw-plugin && npx vitest run`)
- **Claude Code plugin**: 21/21 E2E tests (see `docs/nex-plugin-test-results.md`)
- **MCP server**: Builds clean, all tools typed with Zod schemas
- **SKILL scripts**: Syntax validated, injection-resistant, cross-platform (macOS + Linux)

## License

MIT
