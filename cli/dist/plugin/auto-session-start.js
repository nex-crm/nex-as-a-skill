#!/usr/bin/env node
/**
 * Claude Code SessionStart hook — bulk context load from Nex + file scan.
 *
 * Fires once when a new Claude Code session begins. Queries Nex for
 * a baseline context summary and injects it so the agent "already knows"
 * relevant business context from the first message.
 *
 * On startup/clear: also scans project files and ingests changed ones.
 * On compact/resume: skips file scan (files already ingested, just re-query summary).
 *
 * On ANY error: outputs {} and exits 0 (graceful degradation).
 */
import { loadConfig, loadScanConfig, ConfigError, isHookEnabled } from "./config.js";
import { NexClient } from "./nex-client.js";
import { RateLimiter } from "./rate-limiter.js";
import { formatNexContext } from "./context-format.js";
import { SessionStore } from "./session-store.js";
import { scanAndIngest } from "./file-scanner.js";
import { ingestContextFiles } from "./context-files.js";
import { readManifest as readScanManifest, isScanFresh, markScanned, writeManifest as writeScanManifest } from "./file-manifest.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
const sessions = new SessionStore();
/**
 * Run nex-update-check as a subprocess and return the result.
 * Returns null on error or if no update available.
 */
function checkForUpdate() {
    try {
        const pluginDir = dirname(fileURLToPath(import.meta.url));
        const checkScript = join(pluginDir, "update-check.js");
        const output = execFileSync("node", [checkScript], {
            encoding: "utf-8",
            timeout: 6000,
            stdio: ["pipe", "pipe", "pipe"],
        }).trim();
        if (output.startsWith("UPGRADE_AVAILABLE") || output.startsWith("JUST_UPGRADED")) {
            return output;
        }
        return null;
    }
    catch {
        return null;
    }
}
const SESSION_START_QUERY = "Summarize the key active context, recent interactions, and important updates for this user.";
async function main() {
    try {
        // Read stdin
        const chunks = [];
        for await (const chunk of process.stdin) {
            chunks.push(chunk);
        }
        const raw = Buffer.concat(chunks).toString("utf-8");
        // Check .nex.toml kill switch
        if (!isHookEnabled("session_start")) {
            process.stdout.write("{}");
            return;
        }
        let input = {};
        try {
            input = JSON.parse(raw);
        }
        catch {
            process.stderr.write("[nex-session-start] Failed to parse stdin JSON, continuing with defaults\n");
        }
        let cfg;
        try {
            cfg = loadConfig();
        }
        catch (err) {
            if (err instanceof ConfigError) {
                // No API key — inject registration prompt so Claude handles it
                const pluginDir = dirname(fileURLToPath(import.meta.url));
                const registerScript = join(pluginDir, "auto-register.js");
                const registrationPrompt = [
                    "[Nex Memory Plugin] No API key configured. Registration is required to enable persistent memory.",
                    "",
                    "IMPORTANT: Before proceeding with the user's request, you must set up Nex memory:",
                    "1. Ask the user for their email address to register for a Nex account",
                    "2. Run the registration command: node " + registerScript + " <email> [name] [company]",
                    "3. Once registration succeeds, the API key is saved automatically — all memory features activate immediately",
                    "",
                    "Keep it brief — just ask for the email and register. No restart needed after registration.",
                ].join("\n");
                const output = JSON.stringify({
                    hookSpecificOutput: {
                        hookEventName: "SessionStart",
                        additionalContext: registrationPrompt,
                    },
                });
                process.stdout.write(output);
                return;
            }
            process.stderr.write(`[nex-session-start] Config error: ${err instanceof Error ? err.message : String(err)}\n`);
            process.stdout.write("{}");
            return;
        }
        const client = new NexClient(cfg.apiKey, cfg.baseUrl);
        const contextParts = [];
        // --- File scan on startup or clear ---
        const source = input.source ?? "startup";
        const shouldScan = source === "startup" || source === "clear";
        if (shouldScan) {
            // Skip expensive file scanning if a scan completed recently (within 1 hour).
            // The context query below still runs — only the file walk + ingest is skipped.
            const scanManifest = readScanManifest();
            const scanFresh = isScanFresh(scanManifest);
            if (scanFresh) {
                process.stderr.write("[nex-session-start] Scan fresh — skipping file scan\n");
            }
            else {
                const rateLimiter = new RateLimiter();
                const cwd = process.cwd();
                // --- Ingest CLAUDE.md + memory files (highest priority) ---
                try {
                    const ctxResult = await ingestContextFiles(client, rateLimiter, cwd);
                    if (ctxResult.ingested > 0) {
                        contextParts.push(`[Context files: ${ctxResult.ingested} ingested (${ctxResult.files.join(", ")})]`);
                    }
                }
                catch (err) {
                    process.stderr.write(`[nex-session-start] Context files error: ${err instanceof Error ? err.message : String(err)}\n`);
                }
                // --- Project file scan ---
                try {
                    const scanConfig = loadScanConfig();
                    if (scanConfig.enabled) {
                        const scanResult = await scanAndIngest(client, rateLimiter, cwd, scanConfig);
                        if (scanResult.ingested > 0) {
                            contextParts.push(`[File scan: ${scanResult.ingested} file${scanResult.ingested === 1 ? "" : "s"} ingested, ${scanResult.scanned} scanned]`);
                        }
                    }
                }
                catch (err) {
                    process.stderr.write(`[nex-session-start] File scan error: ${err instanceof Error ? err.message : String(err)}\n`);
                }
                // Mark scan as complete so subsequent sessions skip it
                markScanned(scanManifest);
                writeScanManifest(scanManifest);
            }
        }
        // --- Nex context query ---
        const result = await client.ask(SESSION_START_QUERY, undefined, 10_000);
        if (!result.answer && contextParts.length === 0) {
            process.stdout.write("{}");
            return;
        }
        // Store session mapping
        if (result.session_id && input.session_id) {
            sessions.set(input.session_id, result.session_id);
        }
        const entityCount = result.entity_references?.length ?? 0;
        const context = formatNexContext({
            answer: result.answer,
            entityCount,
            sessionId: result.session_id,
        });
        // Append scan summary if any
        let fullContext = contextParts.length > 0
            ? `${context}\n${contextParts.join("\n")}`
            : context;
        // --- Update check (non-blocking, best-effort) ---
        const updateResult = checkForUpdate();
        if (updateResult) {
            const parts = updateResult.split(" ");
            if (parts[0] === "UPGRADE_AVAILABLE") {
                const [, currentVer, latestVer] = parts;
                fullContext += `\n\n[Nex Update] A new version of Nex is available: ${currentVer} → ${latestVer}. ` +
                    `Inform the user that a Nex update is available and offer to upgrade. ` +
                    `To upgrade, run: nex upgrade`;
            }
            else if (parts[0] === "JUST_UPGRADED") {
                const [, oldVer, newVer] = parts;
                fullContext += `\n\n[Nex Update] Nex was recently upgraded from ${oldVer} to ${newVer}.`;
            }
        }
        const output = JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "SessionStart",
                additionalContext: fullContext,
            },
        });
        process.stdout.write(output);
    }
    catch (err) {
        process.stderr.write(`[nex-session-start] Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.stdout.write("{}");
    }
}
main().then(() => process.exit(0)).catch(() => process.exit(0));
//# sourceMappingURL=auto-session-start.js.map