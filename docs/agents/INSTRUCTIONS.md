# Agent Instructions

## Base Agent Instructions

These instructions apply to AI coding agents working in Nex repositories. Keep
tool-specific root files (`CLAUDE.md`, `AGENTS.md`, etc.) pointed at the same
canonical repo file so Claude, Codex, and other agents receive equivalent
guidance.

No additional setup is required beyond a normal clone of the repository. The
`.github` repository provides rollout tooling and templates only; committed
repo-local instruction files are the runtime source of truth for contributors.

### Working Rules

- Read the relevant code before editing. Do not reason from assumptions when
  the repository can answer the question.
- Prefer narrow, surgical changes that follow existing repo patterns.
- Do not revert changes you did not make unless the user explicitly asks.
- Own bugs surfaced during the work. Do not dismiss them as unrelated when they
  block the requested outcome.
- Ask before destructive or hard-to-reverse actions: deleting state, clearing
  Docker volumes, applying migrations outside local dev, or changing production
  infrastructure.

### Git And PRs

- Never push directly to `main`.
- Use a branch and open a draft PR for code changes.
- Use Conventional Commits for commit messages.
- Run the repo's documented checks before opening or marking a PR ready.
- Do not use `--no-verify` to bypass hooks.

### Quality Bar

- Do not suppress lint or type errors with ignore comments. Fix the code.
- Do not introduce explicit `any` in TypeScript. Use specific types, `unknown`
  with narrowing, or preserve existing untyped boundaries.
- Do not commit secrets, tokens, credentials, or inline API keys.
- Source required secrets from environment files, secret managers, or the
  repo-documented local setup.
- Treat E2E failures as product signals. Do not hand-wave them away.

### Nex Context

Nex is a context graph platform for AI agents, not a CRM. Do not describe the
product as a CRM in code, comments, docs, or external copy.

Use the available Nex memory/context tools when they are installed:

- Query context for people, companies, projects, or prior decisions when that
  context would materially improve the answer.
- Store durable user preferences, project decisions, and lessons learned when
  the user asks to remember them or when future sessions clearly need them.
- Scan repo docs and instruction files after meaningful updates so project
  context stays discoverable.

Tool names differ by platform. Use the equivalent available surface, for
example `query_context` / `nex_ask`, `add_context` / `nex_remember`,
`scan_files`, or `ingest_context_files`.

## CLI And Agent Product Instructions

Use this profile for `nex-cli`, `nex-as-a-skill`, MCP servers, and related
agent-facing tooling.

### Product Bar

- Treat terminal output, MCP tool descriptions, slash commands, and error
  messages as user-facing product surfaces.
- Every interactive workflow should have a scriptable equivalent when the
  product surface supports both.
- Error messages should be actionable and should avoid raw stack traces unless
  the user explicitly asks for debug output.
- Do not publish private or internal packages, URLs, tokens, or repo names in
  public-facing examples.

### Commands And Packaging

- Use `bun` / `bunx` for JavaScript tooling unless the repo explicitly says
  otherwise.
- Keep lockfiles in sync with package manifest changes.
- Validate generated shims, binary wrappers, package exports, and MCP entry
  points after packaging changes.
- When a repo publishes a binary or npm package, verify the built artifact that
  users will actually install, not just the source tests.

### MCP And Agent Contracts

- Tool schemas, command docs, and platform rules are API contracts. Changes can
  break agents even when TypeScript still passes.
- Keep Claude, Codex, Cursor, Windsurf, and shell-only guidance semantically
  aligned.
- Prefer current platform tool names in docs, and mention aliases only when
  preserving backward compatibility.
- Avoid platform-specific assumptions in shared instructions; put those in the
  relevant platform adapter docs.

### Tests

- New command handlers need focused tests.
- Script and batch behavior need integration coverage where practical.
- Agent/tool surface changes should include either schema checks, fixture tests,
  or a documented manual verification command.
