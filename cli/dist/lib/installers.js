/**
 * Platform-specific installers for Nex MCP server, hooks, plugins, agents, and workflows.
 *
 * Installation hierarchy (per platform):
 *   1. Hooks (event-driven scripts)
 *   2. Custom tools/plugins (OpenCode plugin, OpenClaw plugin)
 *   3. Custom agents/modes (VS Code agent, Kilo Code mode)
 *   4. Workflows/slash commands (Windsurf workflows)
 *   5. Rules (instruction files)
 *   6. MCP (tool protocol)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MCP_SERVER_ENTRY = {
    command: "nex-mcp",
    env: {},
};
// ── Shared helpers ──────────────────────────────────────────────────────
function readJsonFile(path) {
    try {
        const raw = readFileSync(path, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
function writeJsonFile(path, data) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}
/**
 * Resolve bundled plugin paths.
 * From dist/lib/installers.js:
 *   __dirname = <pkg>/dist/lib/
 *   dist/plugin/ = __dirname/../plugin/
 *   plugin-commands/ = __dirname/../../plugin-commands/
 *   platform-plugins/ = __dirname/../../platform-plugins/
 *   platform-rules/ = __dirname/../../platform-rules/
 */
function getPluginDistDir() {
    return join(__dirname, "..", "plugin");
}
function getPluginCommandsDir() {
    return join(__dirname, "..", "..", "plugin-commands");
}
function getPluginRulesDir() {
    return join(__dirname, "..", "..", "platform-rules");
}
function getPlatformPluginsDir() {
    return join(__dirname, "..", "..", "platform-plugins");
}
// ── 1. Generic MCP Installer ───────────────────────────────────────────
export function installMcpServer(platform, apiKey) {
    if (!platform.configPath) {
        return { installed: false, configPath: "" };
    }
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
    if (platform.configFormat === "codex") {
        return installCodexMcp(platform.configPath, apiKey);
    }
    // Standard JSON format (Cursor, Claude Desktop, VS Code, Windsurf, Cline, Kilo Code, OpenCode)
    const config = readJsonFile(platform.configPath);
    if (!config.mcpServers || typeof config.mcpServers !== "object") {
        config.mcpServers = {};
    }
    config.mcpServers.nex = entry;
    writeJsonFile(platform.configPath, config);
    return { installed: true, configPath: platform.configPath };
}
function installZedMcp(configPath, entry) {
    const config = readJsonFile(configPath);
    if (!config.context_servers || typeof config.context_servers !== "object") {
        config.context_servers = {};
    }
    config.context_servers.nex = {
        command: { path: entry.command, env: entry.env },
    };
    writeJsonFile(configPath, config);
    return { installed: true, configPath };
}
function installContinueMcp(configPath, apiKey) {
    const mcpPath = configPath.replace("config.yaml", "mcp.json");
    const config = readJsonFile(mcpPath);
    if (!config.mcpServers || typeof config.mcpServers !== "object") {
        config.mcpServers = {};
    }
    config.mcpServers.nex = {
        ...MCP_SERVER_ENTRY,
        env: { NEX_API_KEY: apiKey },
    };
    writeJsonFile(mcpPath, config);
    return { installed: true, configPath: mcpPath };
}
function installCodexMcp(configPath, apiKey) {
    let content = "";
    try {
        content = readFileSync(configPath, "utf-8");
    }
    catch {
        // File doesn't exist — will create
    }
    const nexBlock = [
        `[mcp_servers.nex]`,
        `command = "nex-mcp"`,
        ``,
        `[mcp_servers.nex.env]`,
        `NEX_API_KEY = "${apiKey}"`,
    ].join("\n");
    if (content.includes("[mcp_servers.nex]")) {
        // Remove existing nex section(s) and re-add
        const lines = content.split("\n");
        const filtered = [];
        let inNexSection = false;
        for (const line of lines) {
            const trimmed = line.trimStart();
            if (trimmed.startsWith("[")) {
                if (trimmed.startsWith("[mcp_servers.nex]") || trimmed.startsWith("[mcp_servers.nex.")) {
                    inNexSection = true;
                    continue;
                }
                else {
                    inNexSection = false;
                }
            }
            if (!inNexSection) {
                filtered.push(line);
            }
        }
        // Remove trailing blank lines before appending
        while (filtered.length > 0 && filtered[filtered.length - 1].trim() === "") {
            filtered.pop();
        }
        content = filtered.join("\n") + "\n\n" + nexBlock + "\n";
    }
    else {
        // Append to file
        const separator = content && !content.endsWith("\n\n")
            ? (content.endsWith("\n") ? "\n" : "\n\n")
            : "";
        content = content + separator + nexBlock + "\n";
    }
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, content, "utf-8");
    return { installed: true, configPath };
}
export function installClaudeCodePlugin() {
    const home = homedir();
    const claudeDir = join(home, ".claude");
    const settingsPath = join(claudeDir, "settings.json");
    const distDir = getPluginDistDir();
    // Verify bundled plugin exists
    if (!existsSync(join(distDir, "auto-recall.js"))) {
        return { installed: false, hooksAdded: [], commandsCopied: [] };
    }
    // 1. Read existing settings.json
    let settings = {};
    try {
        const raw = readFileSync(settingsPath, "utf-8");
        settings = JSON.parse(raw);
    }
    catch {
        // Start fresh
    }
    if (!settings.hooks) {
        settings.hooks = {};
    }
    const hooksAdded = [];
    // 2. Add hooks (idempotent — remove stale nex hooks, then add fresh ones)
    const hookDefs = [
        {
            event: "SessionStart",
            script: join(distDir, "auto-session-start.js"),
            timeout: 120000,
            statusMessage: "Loading knowledge context...",
        },
        {
            event: "UserPromptSubmit",
            script: join(distDir, "auto-recall.js"),
            timeout: 12000,
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
        if (!settings.hooks[def.event]) {
            settings.hooks[def.event] = [];
        }
        const groups = settings.hooks[def.event];
        // Remove any existing nex hook entries (handles path updates on upgrade)
        const filtered = groups.filter((g) => !g.hooks.some((h) => h.command.includes("auto-recall") || h.command.includes("auto-capture") || h.command.includes("auto-session-start")));
        const hookEntry = {
            type: "command",
            command: `node ${def.script}`,
            timeout: def.timeout,
        };
        if (def.statusMessage)
            hookEntry.statusMessage = def.statusMessage;
        if (def.async)
            hookEntry.async = true;
        filtered.push({ matcher: "", hooks: [hookEntry] });
        settings.hooks[def.event] = filtered;
        hooksAdded.push(def.event);
    }
    // 3. Write settings.json
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
    // 4. Copy slash commands (copy, not symlink — survives npm updates)
    const commandsCopied = [];
    const commandsDir = join(claudeDir, "commands");
    const sourceCommandsDir = getPluginCommandsDir();
    if (existsSync(sourceCommandsDir)) {
        mkdirSync(commandsDir, { recursive: true });
        try {
            const entries = readdirSync(sourceCommandsDir);
            for (const entry of entries) {
                if (!entry.endsWith(".md"))
                    continue;
                const target = join(commandsDir, entry);
                const source = join(sourceCommandsDir, entry);
                try {
                    unlinkSync(target);
                }
                catch { /* File didn't exist */ }
                try {
                    copyFileSync(source, target);
                    commandsCopied.push(entry);
                }
                catch { /* Copy failed — non-critical */ }
            }
        }
        catch { /* Commands dir read failed — non-critical */ }
    }
    return { installed: true, hooksAdded, commandsCopied };
}
// ── 3. Hook Installers (Cursor, Windsurf, Cline) ──────────────────────
/**
 * Install hook scripts for platforms that support event-driven hooks.
 * Each platform has its own adapter scripts in dist/plugin/adapters/.
 */
export function installHooks(platform) {
    // Claude Code handled separately via installClaudeCodePlugin
    if (platform.id === "claude-code") {
        return { installed: false, hooksAdded: [] };
    }
    const adapterDir = join(getPluginDistDir(), "adapters");
    if (!existsSync(adapterDir)) {
        return { installed: false, hooksAdded: [] };
    }
    if (platform.id === "cursor")
        return installCursorHooks(adapterDir, platform);
    if (platform.id === "windsurf")
        return installWindsurfHooks(adapterDir, platform);
    if (platform.id === "cline")
        return installClineHooks(adapterDir, platform);
    return { installed: false, hooksAdded: [] };
}
function installCursorHooks(adapterDir, platform) {
    const hookConfigPath = platform.hookConfigPath;
    if (!hookConfigPath)
        return { installed: false, hooksAdded: [] };
    const config = readJsonFile(hookConfigPath);
    if (!config.hooks || typeof config.hooks !== "object") {
        config.hooks = {};
    }
    const hooks = config.hooks;
    const hooksAdded = [];
    const cursorHookDefs = [
        { event: "sessionStart", script: "cursor-session-start.js", timeout: 120000 },
        { event: "userPromptSubmit", script: "cursor-recall.js", timeout: 10000 },
        { event: "stop", script: "cursor-stop.js", timeout: 10000 },
    ];
    for (const def of cursorHookDefs) {
        const scriptPath = join(adapterDir, def.script);
        if (!existsSync(scriptPath))
            continue;
        if (!hooks[def.event])
            hooks[def.event] = [];
        // Remove existing nex hooks
        hooks[def.event] = hooks[def.event].filter((h) => !String(h.command ?? "").includes("nex"));
        hooks[def.event].push({
            type: "command",
            command: `node ${scriptPath}`,
            timeout: def.timeout,
        });
        hooksAdded.push(def.event);
    }
    writeJsonFile(hookConfigPath, config);
    return { installed: true, hooksAdded };
}
function installWindsurfHooks(adapterDir, platform) {
    const hookConfigPath = platform.hookConfigPath;
    if (!hookConfigPath)
        return { installed: false, hooksAdded: [] };
    const config = readJsonFile(hookConfigPath);
    if (!config.hooks || typeof config.hooks !== "object") {
        config.hooks = {};
    }
    const hooks = config.hooks;
    const hooksAdded = [];
    const windsurfHookDefs = [
        { event: "pre_user_prompt", script: "windsurf-recall.js", timeout: 10000 },
        { event: "post_cascade_response", script: "windsurf-capture.js", timeout: 10000 },
    ];
    for (const def of windsurfHookDefs) {
        const scriptPath = join(adapterDir, def.script);
        if (!existsSync(scriptPath))
            continue;
        if (!hooks[def.event])
            hooks[def.event] = [];
        hooks[def.event] = hooks[def.event].filter((h) => !String(h.command ?? "").includes("nex"));
        hooks[def.event].push({
            type: "command",
            command: `node ${scriptPath}`,
            timeout: def.timeout,
        });
        hooksAdded.push(def.event);
    }
    writeJsonFile(hookConfigPath, config);
    return { installed: true, hooksAdded };
}
function installClineHooks(adapterDir, platform) {
    // Cline uses executable files in .clinerules/hooks/
    const hookDir = platform.hookConfigPath;
    if (!hookDir)
        return { installed: false, hooksAdded: [] };
    mkdirSync(hookDir, { recursive: true });
    const hooksAdded = [];
    const clineHookDefs = [
        { event: "UserPromptSubmit", script: "cline-recall.js" },
        { event: "TaskStart", script: "cline-task-start.js" },
        { event: "TaskComplete", script: "cline-capture.js" },
    ];
    for (const def of clineHookDefs) {
        const scriptPath = join(adapterDir, def.script);
        if (!existsSync(scriptPath))
            continue;
        // Write a shell wrapper that invokes node with the adapter script
        const wrapperPath = join(hookDir, `nex-${def.event.toLowerCase()}`);
        const wrapper = `#!/usr/bin/env sh\nexec node "${scriptPath}" "$@"\n`;
        writeFileSync(wrapperPath, wrapper, { mode: 0o755 });
        hooksAdded.push(def.event);
    }
    return { installed: true, hooksAdded };
}
// ── 4. Custom Tool/Plugin Installers ───────────────────────────────────
/**
 * Install OpenCode plugin template to .opencode/plugins/nex.ts.
 */
export function installOpenCodePlugin() {
    const templatePath = join(getPlatformPluginsDir(), "opencode-plugin.ts");
    if (!existsSync(templatePath)) {
        return { installed: false, pluginPath: "" };
    }
    const targetDir = join(process.cwd(), ".opencode", "plugins");
    const targetPath = join(targetDir, "nex.ts");
    mkdirSync(targetDir, { recursive: true });
    copyFileSync(templatePath, targetPath);
    return { installed: true, pluginPath: targetPath };
}
/**
 * Install OpenClaw plugin via CLI.
 */
export function installOpenClawPlugin(apiKey) {
    // Check if openclaw CLI is available
    let hasOpenClaw = false;
    try {
        execFileSync("which", ["openclaw"], { stdio: "ignore" });
        hasOpenClaw = true;
    }
    catch { /* not installed */ }
    if (!hasOpenClaw) {
        return {
            installed: false,
            message: "Install OpenClaw to enable: https://docs.openclaw.ai/install",
        };
    }
    // Check if plugin already installed
    const configPath = join(homedir(), ".openclaw", "openclaw.json");
    const config = readJsonFile(configPath);
    const plugins = (config.plugins ?? {});
    const entries = (plugins.entries ?? {});
    if (!entries.nex) {
        // Install the plugin from bundled path inside @nex-ai/nex package
        const bundledPluginPath = join(__dirname, "..", "..", "openclaw-plugin");
        try {
            execFileSync("openclaw", ["plugins", "install", bundledPluginPath], {
                stdio: "ignore",
                timeout: 30_000,
            });
        }
        catch {
            return { installed: false, message: "Failed to install OpenClaw plugin" };
        }
    }
    // Configure API key
    const freshConfig = readJsonFile(configPath);
    const freshPlugins = (freshConfig.plugins ?? {});
    const freshEntries = (freshPlugins.entries ?? {});
    if (!freshEntries.nex)
        freshEntries.nex = {};
    if (!freshEntries.nex.config)
        freshEntries.nex.config = {};
    freshEntries.nex.config.apiKey = apiKey;
    freshEntries.nex.enabled = true;
    freshPlugins.entries = freshEntries;
    freshConfig.plugins = freshPlugins;
    writeJsonFile(configPath, freshConfig);
    return { installed: true, message: "OpenClaw plugin installed and configured" };
}
// ── 5. Custom Agent/Mode Installers ────────────────────────────────────
/**
 * Install VS Code custom agent (.github/agents/nex.agent.md).
 */
export function installVSCodeAgent() {
    const templatePath = join(getPlatformPluginsDir(), "vscode-agent.md");
    if (!existsSync(templatePath)) {
        return { installed: false, agentPath: "" };
    }
    const targetDir = join(process.cwd(), ".github", "agents");
    const targetPath = join(targetDir, "nex.agent.md");
    mkdirSync(targetDir, { recursive: true });
    copyFileSync(templatePath, targetPath);
    return { installed: true, agentPath: targetPath };
}
/**
 * Install Kilo Code custom mode (.kilocodemodes YAML).
 */
export function installKiloCodeMode() {
    const templatePath = join(getPlatformPluginsDir(), "kilocode-modes.yaml");
    if (!existsSync(templatePath)) {
        return { installed: false, modePath: "" };
    }
    const targetPath = join(process.cwd(), ".kilocodemodes");
    // Read existing modes file if present
    let existing = "";
    try {
        existing = readFileSync(targetPath, "utf-8");
    }
    catch { /* doesn't exist */ }
    // If already has nex-crm mode, skip
    if (existing.includes("nex-crm")) {
        return { installed: true, modePath: targetPath };
    }
    const template = readFileSync(templatePath, "utf-8");
    if (existing) {
        // Append to existing customModes
        // Remove the "customModes:" header from template since it already exists
        const modesContent = template.replace(/^customModes:\s*\n/, "");
        writeFileSync(targetPath, existing.trimEnd() + "\n" + modesContent, "utf-8");
    }
    else {
        writeFileSync(targetPath, template, "utf-8");
    }
    return { installed: true, modePath: targetPath };
}
/**
 * Install Continue.dev context provider template.
 */
export function installContinueProvider() {
    const templatePath = join(getPlatformPluginsDir(), "continue-provider.ts");
    if (!existsSync(templatePath)) {
        return { installed: false, providerPath: "" };
    }
    const continueBase = existsSync(join(process.cwd(), ".continue"))
        ? join(process.cwd(), ".continue")
        : join(homedir(), ".continue");
    const targetDir = join(continueBase, ".plugins");
    const targetPath = join(targetDir, "nex-provider.ts");
    mkdirSync(targetDir, { recursive: true });
    copyFileSync(templatePath, targetPath);
    return { installed: true, providerPath: targetPath };
}
// ── 6. Workflow Installers ─────────────────────────────────────────────
/**
 * Install Windsurf workflow files (slash commands).
 */
export function installWindsurfWorkflows() {
    const sourceDir = join(getPlatformPluginsDir(), "windsurf-workflows");
    if (!existsSync(sourceDir)) {
        return { installed: false, workflowCount: 0 };
    }
    const targetDir = join(process.cwd(), ".windsurf", "workflows");
    mkdirSync(targetDir, { recursive: true });
    let count = 0;
    try {
        const entries = readdirSync(sourceDir);
        for (const entry of entries) {
            if (!entry.endsWith(".md"))
                continue;
            copyFileSync(join(sourceDir, entry), join(targetDir, entry));
            count++;
        }
    }
    catch { /* non-critical */ }
    return { installed: count > 0, workflowCount: count };
}
// ── 7. Rules File Installer ────────────────────────────────────────────
const NEX_RULES_MARKER_START = "# --- Nex Context & Memory ---";
const NEX_RULES_MARKER_END = "# --- End Nex ---";
/**
 * Map platform ID to its rules template filename.
 */
const RULES_TEMPLATE_MAP = {
    cursor: "cursor-rules.md",
    vscode: "vscode-instructions.md",
    windsurf: "windsurf-rules.md",
    cline: "cline-rules.md",
    continue: "continue-rules.md",
    zed: "zed-rules.md",
    kilocode: "kilocode-rules.md",
    opencode: "opencode-agents.md",
    aider: "aider-conventions.md",
    codex: "codex-agents.md",
};
/**
 * Platforms where rules are APPENDED to an existing file (with markers)
 * rather than written as a standalone file.
 */
const APPEND_PLATFORMS = new Set(["zed", "opencode", "aider", "codex"]);
export function installRulesFile(platform) {
    const rulesPath = platform.rulesPath;
    if (!rulesPath) {
        return { installed: false, rulesPath: "" };
    }
    const templateName = RULES_TEMPLATE_MAP[platform.id];
    if (!templateName) {
        return { installed: false, rulesPath: "" };
    }
    const templatePath = join(getPluginRulesDir(), templateName);
    if (!existsSync(templatePath)) {
        return { installed: false, rulesPath: "" };
    }
    const template = readFileSync(templatePath, "utf-8");
    if (APPEND_PLATFORMS.has(platform.id)) {
        // Append mode: add/replace section in existing file
        let existing = "";
        try {
            existing = readFileSync(rulesPath, "utf-8");
        }
        catch {
            // File doesn't exist — will create
        }
        // Check if nex section already exists
        const startIdx = existing.indexOf(NEX_RULES_MARKER_START);
        const endIdx = existing.indexOf(NEX_RULES_MARKER_END);
        if (startIdx !== -1 && endIdx !== -1) {
            // Replace existing section
            const before = existing.slice(0, startIdx);
            const after = existing.slice(endIdx + NEX_RULES_MARKER_END.length);
            const updated = before + template.trim() + after;
            mkdirSync(dirname(rulesPath), { recursive: true });
            writeFileSync(rulesPath, updated, "utf-8");
        }
        else if (existing.includes("nex_ask") || existing.includes("Nex Context")) {
            // Already has nex content without markers — skip to avoid duplicates
            return { installed: true, rulesPath };
        }
        else {
            // Append to end
            const separator = existing && !existing.endsWith("\n\n") ? "\n\n" : "";
            mkdirSync(dirname(rulesPath), { recursive: true });
            writeFileSync(rulesPath, existing + separator + template.trim() + "\n", "utf-8");
        }
    }
    else {
        // Standalone mode: write the file directly
        mkdirSync(dirname(rulesPath), { recursive: true });
        writeFileSync(rulesPath, template, "utf-8");
    }
    return { installed: true, rulesPath };
}
// ── 8. Sync API key to ~/.nex/config.json ──────────────────────────────
/**
 * Persist API key to the canonical config file (~/.nex/config.json).
 * Name kept as syncApiKeyToMcpConfig for backward compatibility with callers.
 */
export function syncApiKeyToMcpConfig(apiKey) {
    const configPath = join(homedir(), ".nex", "config.json");
    const config = readJsonFile(configPath);
    config.api_key = apiKey;
    writeJsonFile(configPath, config);
}
//# sourceMappingURL=installers.js.map