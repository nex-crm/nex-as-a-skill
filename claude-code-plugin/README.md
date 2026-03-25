# Nex Memory Plugin for Claude Code

Persistent context intelligence for Claude Code, powered by Nex. Automatically recalls relevant knowledge before each prompt and captures conversation facts after each response.

## Features

- **Auto-recall** — `UserPromptSubmit` hook queries Nex and injects relevant context
- **Auto-capture** — `Stop` hook captures assistant responses to build your knowledge base
- **Slash commands** — `/nex:recall <query>` and `/nex:remember <text>` for manual control
- **MCP tools** — Full Nex API access via the MCP server

## Prerequisites

- Node.js 18+
- A Nex API key (get one at [app.nex.ai](https://app.nex.ai)) — [API docs](https://docs.nex.ai)
- Claude Code CLI

## Installation

```bash
cd claude-code-plugin
bun install
bun run build
```

## Setup

### 1. Environment Variables

```bash
export NEX_API_KEY="your-api-key-here"
export NEX_API_BASE_URL="https://app.nex.ai"  # optional, defaults to app.nex.ai
```

### 2. MCP Server Registration

Register the Nex MCP server so Claude Code can use `/nex:recall` and `/nex:remember`:

```bash
claude mcp add nex -- node /path/to/mcp/dist/index.js
```

### 3. Hook Configuration

Copy the hook entries from `settings.json` into your Claude Code settings at `~/.claude/settings.json`. Update the `<path-to>` placeholder with the actual path:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /absolute/path/to/claude-code-plugin/dist/auto-session-start.js",
            "timeout": 120000,
            "statusMessage": "Loading knowledge context..."
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /absolute/path/to/claude-code-plugin/dist/auto-recall.js",
            "timeout": 12000,
            "statusMessage": "Recalling relevant memories..."
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /absolute/path/to/claude-code-plugin/dist/auto-capture.js",
            "timeout": 10000,
            "async": true
          }
        ]
      }
    ]
  }
}
```

### 4. Slash Commands

Copy the `commands/` directory to your project's `.claude/commands/` or global `~/.claude/commands/`:

```bash
cp -r commands/ ~/.claude/commands/
```

Then use:
- `/nex:recall <query>` — Search your Nex knowledge base
- `/nex:remember <text>` — Store information in Nex

## How It Works

### Session Start (SessionStart Hook)

1. Fires once when a new Claude Code session begins
2. Queries Nex for a baseline context summary ("key active context, recent interactions, important updates")
3. Injects as system context so the agent "already knows" relevant business context from the first message
4. On any error: returns `{}`, logs to stderr (graceful degradation)

### Auto-Recall (UserPromptSubmit Hook)

1. Reads the user's prompt from stdin (`{ "prompt": "...", "session_id": "..." }`)
2. Runs prompt through `recall-filter.ts` and skips only low-signal input such as short messages, slash commands, explicit `!` opt-out prompts, and bare shell commands
3. If recall is needed, tries a short synchronous `/ask` request so relevant context can land on the same user turn
4. If the sync budget is missed, falls back to a background `/ask` request and caches the result for the next eligible prompt
5. Returns `{ "additionalContext": "<nex-context>...</nex-context>" }` when recall is ready to inject into the conversation
6. On any error: returns `{}`, logs to stderr (graceful degradation)

### Auto-Capture (Stop Hook)

1. Reads `{ "last_assistant_message": "...", "session_id": "..." }` from stdin
2. Strips any `<nex-context>` blocks (prevents feedback loops)
3. Filters out short, duplicate, or command messages
4. Sends to Nex `/text` endpoint (fire-and-forget, `async: true`)
5. On any error: returns `{}` (graceful degradation)

## Architecture

```
claude-code-plugin/
├── src/
│   ├── auto-session-start.ts  # SessionStart hook — baseline context load
│   ├── auto-recall.ts         # UserPromptSubmit hook — fast recall + cache fallback
│   ├── auto-capture.ts        # Stop hook — conversation capture
│   ├── auto-recall-worker.ts  # Background recall worker for slow Ask calls
│   ├── recall-filter.ts       # Smart prompt classifier
│   ├── nex-client.ts          # HTTP client for Nex API
│   ├── config.ts              # Environment variable config
│   ├── context-format.ts      # XML context formatting
│   ├── capture-filter.ts      # Smart capture filtering
│   ├── recall-cache.ts        # Session-scoped pending/ready recall cache
│   ├── rate-limiter.ts        # Sliding window rate limiter
│   └── session-store.ts       # LRU session ID mapping
├── commands/
│   ├── nex:recall.md          # /nex:recall slash command
│   └── nex:remember.md        # /nex:remember slash command
├── settings.json              # Hook configuration template
└── README.md
```
