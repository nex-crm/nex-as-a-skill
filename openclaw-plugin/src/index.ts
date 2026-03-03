/**
 * Nex Memory Plugin for OpenClaw
 *
 * Gives OpenClaw agents persistent long-term memory powered by the Nex
 * context intelligence layer. Auto-recalls relevant context before each
 * agent turn and auto-captures conversation facts after each turn.
 *
 * Features: auto-recall, auto-capture, file scanning, plan ingestion,
 * smart recall filtering, registration, and slash commands.
 */

import { Type, type Static } from "@sinclair/typebox";
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";
import {
  parseConfig,
  parseScanConfig,
  loadMcpConfig,
  persistRegistration,
  loadBaseUrl,
  MCP_CONFIG_PATH,
  type NexPluginConfig,
} from "./config.js";
import { NexClient, NexAuthError } from "./nex-client.js";
import { RateLimiter } from "./rate-limiter.js";
import { SessionStore } from "./session-store.js";
import { formatNexContext, stripNexContext } from "./context-format.js";
import { captureFilter, type AgentMessage } from "./capture-filter.js";
import { scanAndIngest } from "./file-scanner.js";
import { ingestContextFiles } from "./context-files.js";
import { readManifest, writeManifest, isChanged, markIngested } from "./file-manifest.js";
import { RecallFilter } from "./recall-filter.js";

// --- TypeBox schemas for tool parameters ---

const SearchParams = Type.Object({
  query: Type.String({ description: "What to search for in the knowledge base" }),
});

const RememberParams = Type.Object({
  content: Type.String({ description: "The information to remember" }),
  label: Type.Optional(Type.String({ description: "Optional context label (e.g. 'meeting notes', 'preference')" })),
});

const EntitiesParams = Type.Object({
  query: Type.String({ description: "Search query to find related entities" }),
});

const ScanParams = Type.Object({
  directory: Type.Optional(Type.String({ description: "Directory to scan (default: current working directory)" })),
});

const RegisterParams = Type.Object({
  email: Type.String({ description: "Your email address for registration" }),
  name: Type.Optional(Type.String({ description: "Your name" })),
  company: Type.Optional(Type.String({ description: "Your company name" })),
});

// --- Plugin Logger interface (matches OpenClaw's PluginLogger) ---

interface Logger {
  debug?(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

// --- Minimal OpenClaw Plugin API types ---
// These match the actual OpenClaw SDK types discovered during research.

interface PluginHookAgentContext {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  workspaceDir?: string;
  messageProvider?: string;
}

interface BeforeAgentStartEvent {
  prompt: string;
  messages?: unknown[];
}

interface AgentEndEvent {
  messages: unknown[];
  success: boolean;
  error?: unknown;
  durationMs?: number;
}

interface PluginCommandContext {
  args?: string;
  commandBody: string;
}

interface ToolCallResult {
  content: Array<{ type: string; text: string }>;
  details: unknown;
}

interface OpenClawPluginApi {
  id: string;
  name: string;
  pluginConfig?: Record<string, unknown>;
  logger: Logger;

  on(
    hookName: "before_agent_start",
    handler: (event: BeforeAgentStartEvent, ctx: PluginHookAgentContext) =>
      Promise<{ prependContext?: string } | void> | { prependContext?: string } | void,
    opts?: { priority?: number }
  ): void;

  on(
    hookName: "agent_end",
    handler: (event: AgentEndEvent, ctx: PluginHookAgentContext) => Promise<void> | void,
    opts?: { priority?: number }
  ): void;

  registerTool(tool: {
    name: string;
    label: string;
    description: string;
    parameters: unknown;
    execute: (
      toolCallId: string,
      params: Record<string, unknown>,
      signal?: AbortSignal,
    ) => Promise<ToolCallResult>;
    ownerOnly?: boolean;
  }): void;

  registerCommand(command: {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    handler: (ctx: PluginCommandContext) => Promise<{ text: string }> | { text: string };
  }): void;

  registerService(service: {
    id: string;
    start: (ctx: { logger: Logger }) => Promise<void> | void;
    stop?: (ctx: { logger: Logger }) => Promise<void> | void;
  }): void;
}

// --- Plan file ingestion helper ---

const PLAN_DIRS = [".claude/plans", ".openclaw/plans"];
const MAX_PLANS_PER_TURN = 2;

async function ingestPlanFiles(
  client: NexClient,
  cwd: string,
  debug: (...args: unknown[]) => void,
): Promise<{ ingested: number; errors: number }> {
  const result = { ingested: 0, errors: 0 };
  const manifest = readManifest();
  let dirty = false;

  for (const planDir of PLAN_DIRS) {
    const fullDir = join(cwd, planDir);
    if (!existsSync(fullDir)) continue;

    let entries;
    try {
      entries = readdirSync(fullDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (result.ingested >= MAX_PLANS_PER_TURN) break;
      if (!entry.isFile()) continue;
      if (extname(entry.name).toLowerCase() !== ".md") continue;

      const filePath = join(fullDir, entry.name);
      try {
        const stat = statSync(filePath);
        if (!isChanged(filePath, stat, manifest)) continue;

        const content = readFileSync(filePath, "utf-8");
        if (content.length < 10) continue;

        const contextTag = `plan:${planDir}/${entry.name}`;
        await client.ingest(content.slice(0, 100_000), contextTag);
        markIngested(filePath, stat, contextTag, manifest);
        result.ingested++;
        dirty = true;
        debug("Plan file ingested:", contextTag);
      } catch (err) {
        process.stderr.write(
          `[nex-plans] Failed to ingest ${entry.name}: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        result.errors++;
      }
    }
  }

  if (dirty) writeManifest(manifest);
  return result;
}

// --- Plugin definition ---

const plugin = {
  id: "memory-nex",
  name: "Nex Memory",
  description: "Persistent context intelligence for OpenClaw agents, powered by Nex",
  version: "0.2.0",
  kind: "memory" as const,

  register(api: OpenClawPluginApi) {
    const log = api.logger;

    // --- Config ---
    let cfg: NexPluginConfig;
    try {
      cfg = parseConfig(api.pluginConfig);
    } catch (err) {
      log.error("Failed to parse Nex plugin config:", err);
      throw err;
    }

    const client = new NexClient(cfg.apiKey, cfg.baseUrl);
    const rateLimiter = new RateLimiter();
    const sessions = new SessionStore();
    const recallFilter = new RecallFilter();

    const debug = (...args: unknown[]) => {
      if (cfg.debug && log.debug) log.debug("[nex]", ...args);
    };

    debug("Plugin config loaded", { baseUrl: cfg.baseUrl, autoRecall: cfg.autoRecall, autoCapture: cfg.autoCapture });

    // --- Service (health check + file scanning on start, cleanup on stop) ---

    api.registerService({
      id: "memory-nex",
      async start({ logger }) {
        logger.info("Nex memory plugin starting...");
        try {
          const healthy = await client.healthCheck();
          if (healthy) {
            logger.info("Nex API connection verified");
          } else {
            logger.warn("Nex API health check failed — recall/capture may not work");
          }
        } catch (err) {
          if (err instanceof NexAuthError) {
            logger.error("Nex API key is invalid. Check your apiKey config or NEX_API_KEY env var.");
          } else {
            logger.warn("Could not reach Nex API:", err);
          }
        }

        // File scanning on startup
        try {
          const scanConfig = parseScanConfig(cfg);
          const cwd = process.cwd();
          const scanResult = await scanAndIngest(client, cwd, scanConfig, rateLimiter);
          logger.info(`File scan: ${scanResult.ingested} ingested, ${scanResult.skipped} skipped`);

          const ctxResult = await ingestContextFiles(client, cwd, rateLimiter);
          logger.info(`Context files: ${ctxResult.ingested} ingested`);
        } catch (err) {
          logger.warn("Startup file scan failed:", err);
        }
      },
      async stop({ logger }) {
        logger.info("Nex memory plugin stopping — flushing capture queue...");
        try {
          await Promise.race([
            rateLimiter.flush(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("flush timeout")), 5000)),
          ]);
        } catch {
          logger.warn("Capture queue flush timed out");
        }
        rateLimiter.destroy();
        sessions.clear();
      },
    });

    // --- Hook: before_agent_start (auto-recall with smart filter) ---

    if (cfg.autoRecall) {
      api.on(
        "before_agent_start",
        async (event, ctx) => {
          if (!event.prompt) return;

          // Smart recall filter
          const isFirst = recallFilter.isFirstPrompt(ctx.sessionKey);
          const decision = recallFilter.shouldRecall(event.prompt, isFirst);

          if (!decision.shouldRecall) {
            debug("Recall skipped:", decision.reason);
            return;
          }

          debug("Auto-recall triggered", { sessionKey: ctx.sessionKey, promptLength: event.prompt.length, reason: decision.reason });

          try {
            // Resolve session ID for multi-turn continuity
            const nexSessionId = ctx.sessionKey && cfg.sessionTracking
              ? sessions.get(ctx.sessionKey)
              : undefined;

            const result = await client.ask(event.prompt, nexSessionId, cfg.recallTimeoutMs);

            if (!result.answer) {
              debug("Recall returned empty answer");
              return;
            }

            // Store session ID for future turns
            if (result.session_id && ctx.sessionKey && cfg.sessionTracking) {
              sessions.set(ctx.sessionKey, result.session_id);
            }

            recallFilter.recordRecall();

            const entityCount = result.entity_references?.length ?? 0;
            const context = formatNexContext({
              answer: result.answer,
              entityCount,
              sessionId: result.session_id,
            });

            debug("Recall injecting context", { entityCount, answerLength: result.answer.length });

            return { prependContext: context };
          } catch (err) {
            // Graceful degradation — never block agent on recall failure
            if (err instanceof Error && err.name === "AbortError") {
              debug("Recall timed out");
            } else {
              log.warn("Nex recall failed (agent will proceed without context):", err);
            }
            return;
          }
        },
        { priority: 10 },
      );
    }

    // --- Hook: agent_end (auto-capture + plan ingestion) ---

    if (cfg.autoCapture) {
      api.on("agent_end", async (event, ctx) => {
        const messages = event.messages as AgentMessage[];
        const result = captureFilter(messages, cfg, {
          messageProvider: ctx.messageProvider,
          success: event.success,
        });

        if (result.skipped) {
          debug("Capture skipped:", result.reason);
        } else {
          debug("Capture enqueued", { textLength: result.text.length });

          // Fire-and-forget via rate limiter
          rateLimiter.enqueue(async () => {
            try {
              const res = await client.ingest(result.text, "openclaw-conversation");
              debug("Capture complete", { artifactId: res.artifact_id });
            } catch (err) {
              log.warn("Nex capture failed:", err);
            }
          }).catch(() => {
            // Queue full / dropped — already logged by rate limiter
          });
        }

        // Plan file ingestion (up to 2 per turn)
        try {
          const cwd = ctx.workspaceDir || process.cwd();
          const planResult = await ingestPlanFiles(client, cwd, debug);
          if (planResult.ingested > 0) {
            debug("Plan files ingested:", planResult.ingested);
          }
        } catch (err) {
          debug("Plan file ingestion failed:", err);
        }
      });
    }

    // --- Tools ---

    api.registerTool({
      name: "nex_search",
      label: "Search Nex Knowledge",
      description:
        "Search the user's Nex knowledge base for relevant context. Returns an AI-synthesized answer with entity references.",
      parameters: SearchParams,
      async execute(_toolCallId, params) {
        const { query } = params as Static<typeof SearchParams>;
        const result = await client.ask(query);

        const parts: string[] = [result.answer];
        if (result.entity_references && result.entity_references.length > 0) {
          parts.push("\n\nRelated entities:");
          for (const ref of result.entity_references) {
            parts.push(`- ${ref.name} (${ref.type})`);
          }
        }

        return {
          content: [{ type: "text", text: parts.join("\n") }],
          details: result,
        };
      },
    });

    api.registerTool({
      name: "nex_remember",
      label: "Remember in Nex",
      description:
        "Store information in the user's Nex knowledge base for long-term recall. Use this when the user explicitly asks you to remember something.",
      parameters: RememberParams,
      async execute(_toolCallId, params) {
        const { content, label } = params as Static<typeof RememberParams>;

        // Enqueue via rate limiter but wait for result
        const res = await new Promise<{ artifact_id: string }>((resolve, reject) => {
          rateLimiter
            .enqueue(async () => {
              const r = await client.ingest(content, label);
              resolve(r);
            })
            .catch(reject);
        });

        return {
          content: [{ type: "text", text: `Remembered. (artifact: ${res.artifact_id})` }],
          details: res,
        };
      },
    });

    api.registerTool({
      name: "nex_entities",
      label: "Find Nex Entities",
      description:
        "Search for entities (people, companies, topics) in the user's Nex knowledge base. Returns a structured list with types and mention counts.",
      parameters: EntitiesParams,
      async execute(_toolCallId, params) {
        const { query } = params as Static<typeof EntitiesParams>;
        const result = await client.ask(query);

        if (!result.entity_references || result.entity_references.length === 0) {
          return {
            content: [{ type: "text", text: "No matching entities found." }],
            details: { entities: [] },
          };
        }

        const lines = result.entity_references.map(
          (ref) => `- ${ref.name} (${ref.type})${ref.count ? ` — ${ref.count} mentions` : ""}`
        );

        return {
          content: [{ type: "text", text: `Found ${result.entity_references.length} entities:\n${lines.join("\n")}` }],
          details: { entities: result.entity_references },
        };
      },
    });

    api.registerTool({
      name: "nex_scan",
      label: "Scan Project Files",
      description:
        "Scan the project directory for text files and ingest changed ones into Nex knowledge base.",
      parameters: ScanParams,
      async execute(_toolCallId, params) {
        const dir = (params as { directory?: string }).directory || process.cwd();
        const scanConfig = parseScanConfig(cfg);
        const result = await scanAndIngest(client, dir, scanConfig, rateLimiter);
        return {
          content: [{ type: "text", text: `Scanned ${result.scanned} files: ${result.ingested} ingested, ${result.skipped} unchanged, ${result.errors} errors` }],
          details: result,
        };
      },
    });

    // --- Commands ---

    api.registerCommand({
      name: "recall",
      description: "Search your Nex knowledge base. Usage: /recall <query>",
      acceptsArgs: true,
      async handler(ctx) {
        const query = ctx.args?.trim();
        if (!query) {
          return { text: "Usage: /recall <query>" };
        }

        try {
          const result = await client.ask(query);
          const parts: string[] = [result.answer];

          if (result.entity_references && result.entity_references.length > 0) {
            const typeLabel = (t: string) => {
              switch (t) {
                case "14": return "Person";
                case "15": return "Company";
                default: return "Entity";
              }
            };
            // Deduplicate by name+type
            const seen = new Set<string>();
            const unique = result.entity_references.filter((ref) => {
              const key = `${ref.name}:${ref.type}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            parts.push("\n\nSources:");
            for (const ref of unique) {
              parts.push(`\n• ${ref.name} · ${typeLabel(ref.type)}`);
            }
          }

          return { text: parts.join("") };
        } catch (err) {
          return { text: `Recall failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    });

    api.registerCommand({
      name: "remember",
      description: "Store information in your Nex knowledge base. Usage: /remember <text>",
      acceptsArgs: true,
      async handler(ctx) {
        const text = ctx.args?.trim();
        if (!text) {
          return { text: "Usage: /remember <text>" };
        }

        try {
          await rateLimiter.enqueue(async () => {
            await client.ingest(text, "manual-command");
          });
          return { text: "Remembered." };
        } catch (err) {
          return { text: `Remember failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    });

    api.registerCommand({
      name: "scan",
      description: "Scan project files and ingest changes into Nex. Usage: /scan [directory]",
      acceptsArgs: true,
      async handler(ctx) {
        const dir = ctx.args?.trim() || process.cwd();
        const scanConfig = parseScanConfig(cfg);
        const result = await scanAndIngest(client, dir, scanConfig, rateLimiter);
        return { text: `Scanned ${result.scanned} files: ${result.ingested} ingested, ${result.skipped} unchanged, ${result.errors} errors` };
      },
    });

    api.registerCommand({
      name: "register",
      description: "Register for a Nex account and save API key. Usage: /register <email> [name] [company]",
      acceptsArgs: true,
      async handler(ctx) {
        const args = ctx.args?.trim().split(/\s+/) ?? [];
        const email = args[0];
        const name = args[1];
        const company = args[2];

        if (!email) {
          return { text: "Usage: /register <email> [name] [company]" };
        }

        // Check if already registered
        const existing = loadMcpConfig();
        if (existing.api_key) {
          return {
            text: `Already registered.\n  API key: ${existing.api_key.slice(0, 12)}...\n  Config: ${MCP_CONFIG_PATH}\n\nTo re-register, delete ~/.nex-mcp.json first.`,
          };
        }

        try {
          const baseUrl = loadBaseUrl();
          const result = await NexClient.register(baseUrl, email, name, company);

          if (!result.api_key || typeof result.api_key !== "string") {
            return { text: "Registration succeeded but no API key returned." };
          }

          // Persist to shared config
          persistRegistration(result);

          return {
            text: `Registration successful!\n  API key: ${(result.api_key as string).slice(0, 12)}...\n${result.workspace_slug ? `  Workspace: ${result.workspace_slug}\n` : ""}  Saved to: ${MCP_CONFIG_PATH}\n\nRestart the plugin for the new key to take effect.`,
          };
        } catch (err) {
          return { text: `Registration failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    });

    log.info(`Nex memory plugin registered (recall: ${cfg.autoRecall}, capture: ${cfg.autoCapture})`);
  },
};

export default plugin;
