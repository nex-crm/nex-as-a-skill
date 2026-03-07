/**
 * Platform-specific installers for Nex MCP server and Claude Code plugin.
 *
 * - Generic MCP installer handles 9/12 platforms (same JSON mcpServers format)
 * - Claude Code installer handles hooks + slash commands
 * - Zed installer uses context_servers instead of mcpServers
 * - Continue.dev writes YAML config
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, symlinkSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import type { Platform } from "./platform-detect.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MCP_SERVER_ENTRY = {
  command: "npx",
  args: ["-y", "@nex-crm/mcp-server"],
  env: {} as Record<string, string>,
};

// --- Generic MCP Installer ---

function readJsonFile(path: string): Record<string, unknown> {
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeJsonFile(path: string, data: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function installMcpServer(
  platform: Platform,
  apiKey: string,
): { installed: boolean; configPath: string } {
  const entry = {
    ...MCP_SERVER_ENTRY,
    env: { NEX_API_KEY: apiKey },
  };

  if (platform.configFormat === "zed") {
    return installZedMcp(platform.configPath, entry);
  }

  if (platform.configFormat === "continue") {
    return installContinueMcp(platform.configPath, apiKey);
  }

  // Standard JSON format (Cursor, Claude Desktop, VS Code, Windsurf, Cline, Kilo Code, OpenCode)
  const config = readJsonFile(platform.configPath);

  if (!config.mcpServers || typeof config.mcpServers !== "object") {
    config.mcpServers = {};
  }
  (config.mcpServers as Record<string, unknown>).nex = entry;

  writeJsonFile(platform.configPath, config);
  return { installed: true, configPath: platform.configPath };
}

function installZedMcp(
  configPath: string,
  entry: typeof MCP_SERVER_ENTRY,
): { installed: boolean; configPath: string } {
  const config = readJsonFile(configPath);

  if (!config.context_servers || typeof config.context_servers !== "object") {
    config.context_servers = {};
  }
  (config.context_servers as Record<string, unknown>).nex = {
    command: { path: entry.command, args: entry.args, env: entry.env },
  };

  writeJsonFile(configPath, config);
  return { installed: true, configPath };
}

function installContinueMcp(
  configPath: string,
  apiKey: string,
): { installed: boolean; configPath: string } {
  // Continue.dev can also accept JSON in a separate mcpServers config
  // Write a simple JSON file alongside the YAML
  const mcpPath = configPath.replace("config.yaml", "mcp.json");
  const config = readJsonFile(mcpPath);

  if (!config.mcpServers || typeof config.mcpServers !== "object") {
    config.mcpServers = {};
  }
  (config.mcpServers as Record<string, unknown>).nex = {
    ...MCP_SERVER_ENTRY,
    env: { NEX_API_KEY: apiKey },
  };

  writeJsonFile(mcpPath, config);
  return { installed: true, configPath: mcpPath };
}

// --- Claude Code Plugin Installer ---

interface HookEntry {
  type: string;
  command: string;
  timeout: number;
  statusMessage?: string;
  async?: boolean;
}

interface HookGroup {
  matcher: string;
  hooks: HookEntry[];
}

interface SettingsJson {
  hooks?: Record<string, HookGroup[]>;
  [key: string]: unknown;
}

export function installClaudeCodePlugin(pluginDir?: string): {
  installed: boolean;
  hooksAdded: string[];
  commandsLinked: string[];
} {
  const home = homedir();
  const claudeDir = join(home, ".claude");
  const settingsPath = join(claudeDir, "settings.json");

  // Resolve plugin directory — find it relative to the CLI package
  const resolvedPluginDir = pluginDir ?? findPluginDir();
  if (!resolvedPluginDir) {
    return { installed: false, hooksAdded: [], commandsLinked: [] };
  }

  // 1. Read existing settings.json
  let settings: SettingsJson = {};
  try {
    const raw = readFileSync(settingsPath, "utf-8");
    settings = JSON.parse(raw) as SettingsJson;
  } catch {
    // Start fresh
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const hooksAdded: string[] = [];
  const distDir = join(resolvedPluginDir, "dist");

  // 2. Add hooks (idempotent — check if nex hooks already exist)
  const hookDefs: Array<{
    event: string;
    script: string;
    timeout: number;
    statusMessage?: string;
    async?: boolean;
  }> = [
    {
      event: "SessionStart",
      script: join(distDir, "auto-session-start.js"),
      timeout: 120000,
      statusMessage: "Loading knowledge context...",
    },
    {
      event: "UserPromptSubmit",
      script: join(distDir, "auto-recall.js"),
      timeout: 10000,
      statusMessage: "Recalling relevant memories...",
    },
    {
      event: "Stop",
      script: join(distDir, "auto-capture.js"),
      timeout: 10000,
      async: true,
    },
  ];

  for (const def of hookDefs) {
    if (!settings.hooks![def.event]) {
      settings.hooks![def.event] = [];
    }

    const groups = settings.hooks![def.event];
    const alreadyInstalled = groups.some((g) =>
      g.hooks.some((h) => h.command.includes("nex") || h.command.includes("auto-recall") || h.command.includes("auto-capture") || h.command.includes("auto-session-start"))
    );

    if (!alreadyInstalled) {
      const hookEntry: HookEntry = {
        type: "command",
        command: `node ${def.script}`,
        timeout: def.timeout,
      };
      if (def.statusMessage) hookEntry.statusMessage = def.statusMessage;
      if (def.async) hookEntry.async = true;

      groups.push({ matcher: "", hooks: [hookEntry] });
      hooksAdded.push(def.event);
    }
  }

  // 3. Write settings.json
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");

  // 4. Symlink slash commands
  const commandsLinked: string[] = [];
  const commandsDir = join(claudeDir, "commands");
  const sourceCommandsDir = join(resolvedPluginDir, "commands");

  if (existsSync(sourceCommandsDir)) {
    mkdirSync(commandsDir, { recursive: true });

    try {
      const entries = readdirSync(sourceCommandsDir);
      for (const entry of entries) {
        if (!entry.endsWith(".md")) continue;
        const target = join(commandsDir, entry);
        const source = join(sourceCommandsDir, entry);

        if (!existsSync(target)) {
          try {
            symlinkSync(source, target, "file");
            commandsLinked.push(entry);
          } catch {
            // May fail if file already exists as regular file — skip
          }
        }
      }
    } catch {
      // Commands dir read failed — non-critical
    }
  }

  return { installed: true, hooksAdded, commandsLinked };
}

/**
 * Find the claude-code-plugin directory relative to the CLI install.
 * Looks for it as a sibling package in the monorepo.
 */
function findPluginDir(): string | undefined {
  // Try common locations
  const candidates = [
    // Sibling in monorepo (development)
    resolve(__dirname, "..", "..", "..", "claude-code-plugin"),
    // npm global install (node_modules sibling)
    resolve(__dirname, "..", "..", "..", "..", "@nex-crm", "claude-code-nex-plugin"),
    // Relative to cli package
    resolve(__dirname, "..", "..", "claude-code-plugin"),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "package.json"))) {
      return candidate;
    }
  }

  return undefined;
}

// --- Sync API key to ~/.nex-mcp.json ---

export function syncApiKeyToMcpConfig(apiKey: string): void {
  const mcpConfigPath = join(homedir(), ".nex-mcp.json");
  const config = readJsonFile(mcpConfigPath);
  config.api_key = apiKey;
  writeJsonFile(mcpConfigPath, config);
}
