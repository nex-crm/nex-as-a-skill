# Nex Memory Plugin for Claude Code

Persistent context intelligence for Claude Code, powered by Nex. Automatically recalls relevant knowledge before each prompt and captures conversation facts after each response.

## Features

- **Auto-recall** — `UserPromptSubmit` hook queries Nex and injects relevant context
- **Auto-capture** — `Stop` hook captures assistant responses to build your knowledge base
- **Slash commands** — `/recall <query>` and `/remember <text>` for manual control
- **MCP tools** — Full Nex API access via the MCP server

## Prerequisites

- Node.js 18+
- A Nex API key (get one at [nex-crm.com](https://nex-crm.com))
- Claude Code CLI

## Installation

```bash
cd claude-code-plugin
npm install
npm run build
```

## Setup

### 1. Environment Variables

```bash
export NEX_API_KEY="your-api-key-here"
export NEX_API_BASE_URL="https://api.nex-crm.com"  # optional, defaults to api.nex-crm.com
```

### 2. MCP Server Registration

Register the Nex MCP server so Claude Code can use `/recall` and `/remember`:

```bash
claude mcp add nex -- node /path/to/mcp/dist/index.js
```

### 3. Hook Configuration

Copy the hook entries from `settings.json` into your Claude Code settings at `~/.claude/settings.json`. Update the `<path-to>` placeholder with the actual path:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /absolute/path/to/claude-code-plugin/dist/auto-recall.js",
            "timeout": 10000,
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
            "timeout": 5000,
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
- `/recall <query>` — Search your Nex knowledge base
- `/remember <text>` — Store information in Nex

## How It Works

### Auto-Recall (UserPromptSubmit Hook)

1. Reads the user's prompt from stdin (`{ "prompt": "...", "session_id": "..." }`)
2. Queries Nex `/ask` endpoint for relevant context
3. Returns `{ "additionalContext": "<nex-context>...</nex-context>" }` to inject into the conversation
4. On any error: returns `{}` (graceful degradation, never blocks Claude Code)

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
│   ├── auto-recall.ts      # UserPromptSubmit hook handler
│   ├── auto-capture.ts     # Stop hook handler
│   ├── nex-client.ts       # HTTP client for Nex API
│   ├── config.ts           # Environment variable config
│   ├── context-format.ts   # XML context formatting
│   ├── capture-filter.ts   # Smart capture filtering
│   ├── rate-limiter.ts     # Sliding window rate limiter
│   └── session-store.ts    # LRU session ID mapping
├── commands/
│   ├── recall.md           # /recall slash command
│   └── remember.md         # /remember slash command
├── settings.json           # Hook configuration template
└── README.md
```
