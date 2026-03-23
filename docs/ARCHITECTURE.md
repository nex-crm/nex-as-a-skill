# Nex CLI — Architecture & Vision

> Zero Humans Company in a CLI — autonomous multi-agent team that operates like a real company.

**Last Updated:** 2026-03-24
**Branch:** `nazz/experiment/multi-agent-cli`
**Status:** Active development

---

## Vision

A single command (`nex team`) launches a team of AI agents that collaborate organically — like a real Slack team. They brainstorm, debate, delegate, and execute. The human participates in the channel alongside the agents.

## Architecture

```
┌─ nex team ──────────────────────────────────────────────┐
│                                                          │
│  tmux session "nex-team"                                 │
│  ┌─ channel (Go TUI) ─┬─ 🤖 CEO ──────────────────┐   │
│  │                     │  Claude Code session       │   │
│  │  Team conversation  │  --append-system-prompt    │   │
│  │  All messages flow  ├─ 🤖 PM ──────────────────┤   │
│  │  here from all     │  Claude Code session       │   │
│  │  agents + human    ├─ 🤖 FE ──────────────────┤   │
│  │                     │  Claude Code session       │   │
│  │  ╭──────────────╮  ├─ 🤖 BE ──────────────────┤   │
│  │  │ Type here... │  │  Claude Code session       │   │
│  │  ╰──────────────╯  │                             │   │
│  └─────────────────────┴─────────────────────────────┘   │
│                                                          │
│  Broker (localhost:7890)     ← ephemeral message store   │
│  Nex MCP (team tools)       ← team_broadcast/team_poll  │
│  Nex Plugin (hooks)         ← context recall/capture     │
│  notifications/claude/channel ← push messages to agents  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Two-Layer Context

### Ephemeral: Team Channel (Broker)
- Real-time conversation between agents
- In-memory, dies with the session
- Agents use `team_broadcast` to post, `team_poll` to read
- Human types directly in the channel TUI
- Like Slack messages

### Durable: Knowledge Graph (Nex)
- Decisions, facts, outcomes stored permanently
- Agents use `add_context` to persist important decisions
- `query_context` retrieves across sessions
- Like decisions documented in Notion

## Agent Packs

Three pre-built teams:

| Pack | Agents | Leader |
|------|--------|--------|
| Founding Team (default) | CEO, PM, FE, BE, Designer, CMO, CRO | CEO |
| Coding Team | Tech Lead, FE, BE, QA | Tech Lead |
| Lead Gen Agency | AE, SDR, Research, Content | AE |

## Communication Protocol

### Channel Rules
1. **User message** → broadcast to all agents via broker
2. **CEO speaks first** — has initial floor after user directive
3. **Agents participate when relevant** — match expertise to topic
4. **@tag to require response** — tagged agents must respond
5. **CEO has final say** — makes execution decisions
6. **Organic turn-taking** — no talking over each other

### Message Delivery
- Nex MCP polls broker every 1s
- Uses `notifications/claude/channel` to push into Claude sessions
- Messages appear in the conversation without user intervention
- Same mechanism as claude-peers-mcp

## Command Structure

21 canonical commands, no aliases:

| Category | Commands |
|----------|----------|
| AI | `/ask`, `/search`, `/remember` |
| Data | `/object`, `/record`, `/note`, `/task`, `/list`, `/rel`, `/attribute` |
| Views | `/agent`, `/graph`, `/insights`, `/calendar`, `/chat` |
| Config | `/config`, `/detect`, `/init`, `/provider` |
| System | `/help`, `/clear`, `/quit` |

All multi-action commands use subcommands: `/object list`, `/object create`.

## File Structure

```
cli/.worktrees/go-bubbletea-port/
├── cmd/nex/
│   ├── main.go          # Entry point: nex, nex team, nex --cmd
│   └── channel.go       # Channel TUI (polls broker, renders conversation)
├── internal/
│   ├── team/
│   │   ├── launcher.go  # tmux session management, agent spawning
│   │   └── broker.go    # HTTP message broker on localhost:7890
│   ├── agent/
│   │   ├── packs.go     # Pack definitions (founding, coding, lead-gen)
│   │   ├── prompts.go   # System prompt generation
│   │   ├── loop.go      # Agent state machine
│   │   ├── service.go   # Agent lifecycle
│   │   └── ...
│   ├── commands/         # 21 slash commands in group files
│   ├── tui/              # Bubbletea TUI (stream, roster, panes, gossip)
│   ├── orchestration/    # Message router, delegator, task router
│   ├── provider/         # Claude Code, Gemini, Nex Ask providers
│   ├── config/           # Configuration management
│   ├── api/              # Nex API HTTP client
│   ├── chat/             # Chat system (channels, messages)
│   ├── calendar/         # Cron scheduling
│   └── tui/render/       # Table, timeline, taskboard, insights, graph
├── mcp/src/tools/
│   └── team.ts           # team_broadcast, team_poll, team_status, team_members
├── tests/
│   ├── e2e/              # Go integration tests
│   └── uat/              # Termwright acceptance tests
└── docs/
    ├── ARCHITECTURE.md   # This file
    ├── requirements-deferred.md
    └── superpowers/specs/ # Design specs
```

## What Works Now
- `nex` — single-agent TUI with 55+ commands, UI renders, chat, calendar
- `nex team` — launches tmux with 7 Claude Code sessions + channel view
- `nex --cmd` — non-interactive command dispatch
- Nex MCP team tools (team_broadcast/poll/status/members)
- Shared broker on localhost:7890
- 340+ tests passing

## What's In Progress
- Push notifications via `notifications/claude/channel` (agents auto-receive messages)
- Pane labels showing agent names in tmux
- End-to-end organic conversation flow
- Human judgment UAT tests

## What's Deferred (P2E/P2F)
- Platform plugin system (12 adapters, 6-layer hierarchy)
- Integration management (OAuth flows for Gmail, Slack, etc.)
