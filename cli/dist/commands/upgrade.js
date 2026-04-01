/**
 * `nex upgrade` — update the nex CLI to the latest version.
 *
 * Detects how nex was installed (bun global, global node_modules, etc.),
 * fetches the latest version from the registry, and runs the appropriate
 * install command.
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pkg = require("../../package.json");
function detectPackageManager() {
    const bunGlobalPath = join(homedir(), ".bun", "install", "global");
    if (existsSync(bunGlobalPath)) {
        try {
            const out = execFileSync("which", ["nex"], { encoding: "utf-8" }).trim();
            if (out.includes(".bun"))
                return "bun";
        }
        catch { /* fall through */ }
    }
    return "node";
}
function fetchLatestVersion() {
    try {
        const raw = execFileSync("curl", ["-sf", "--max-time", "5", "https://registry.npmjs.org/@nex-ai/nex/latest"], { encoding: "utf-8" });
        const data = JSON.parse(raw);
        return data.version ?? null;
    }
    catch {
        return null;
    }
}
export function compareVersions(a, b) {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (diff !== 0)
            return diff;
    }
    return 0;
}
export async function runUpgrade() {
    const current = pkg.version;
    console.log(`Current version: ${current}`);
    console.log("Checking for updates...");
    const latest = fetchLatestVersion();
    if (!latest) {
        console.error("Failed to check for updates. Check your network connection.");
        process.exit(1);
    }
    if (compareVersions(latest, current) <= 0) {
        console.log(`Already up to date (${current}).`);
        process.exit(0);
    }
    console.log(`New version available: ${current} → ${latest}`);
    const pm = detectPackageManager();
    console.log(`Upgrading via ${pm}...`);
    try {
        execFileSync(pm === "bun" ? "bun" : "bun", ["install", "-g", `@nex-ai/nex@${latest}`], {
            stdio: "inherit",
        });
        // Write just-upgraded marker for session start hook detection
        const nexDir = join(homedir(), ".nex");
        mkdirSync(nexDir, { recursive: true });
        writeFileSync(join(nexDir, "just-upgraded-from"), current, "utf-8");
        // Clear stale update cache and snooze state
        try {
            unlinkSync(join(nexDir, "last-update-check"));
        }
        catch { /* ignore */ }
        try {
            unlinkSync(join(nexDir, "update-snoozed"));
        }
        catch { /* ignore */ }
        console.log(`\nUpgraded to ${latest}`);
    }
    catch {
        console.error("Upgrade failed. Try manually: bun install -g @nex-ai/nex@latest");
        process.exit(1);
    }
}
//# sourceMappingURL=upgrade.js.map