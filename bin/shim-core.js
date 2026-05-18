/**
 * Shared resolution + exec logic for the @nex-ai/nex npm shims
 * (bin/nex.js and bin/nex-mcp.js).
 *
 * The npm package ships only those thin shims; the real `nex-cli` binary is
 * fetched by scripts/postinstall.js when `npm install @nex-ai/nex` runs and
 * placed next to this file as bin/nex-cli. resolveCandidates() lists every
 * place the binary might live, in priority order, so the shim works whether
 * the user installed via npm, the curl install script, or a manual copy.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// On win32 Node needs the extension to exec; the release ships no Windows
// binary today, but keep the name correct so a future one Just Works.
const BINARY_NAME = process.platform === "win32" ? "nex-cli.exe" : "nex-cli";

const INSTALL_HINT = `
  nex-cli binary not found.

  The @nex-ai/nex package downloads it automatically on install. To retry:
    npm install -g @nex-ai/nex

  Or install the binary directly:
    curl -fsSL https://raw.githubusercontent.com/nex-crm/nex-as-a-skill/main/install.sh | sh

  Then run your command again.
`;

/**
 * nex-cli locations to try, in priority order:
 *   1. bin/nex-cli inside this package — placed by scripts/postinstall.js.
 *   2. `nex-cli` on PATH — resolved by execFileSync at exec time.
 *   3. The directories install.sh writes to, in case they are not on PATH.
 */
export function resolveCandidates() {
  const candidates = [join(here, BINARY_NAME)];
  candidates.push(BINARY_NAME); // bare name → PATH lookup
  candidates.push("/usr/local/bin/nex-cli");
  if (process.env.HOME) {
    candidates.push(join(process.env.HOME, ".local", "bin", "nex-cli"));
  }
  return candidates;
}

/**
 * Resolve nex-cli and exec it with `args`, inheriting stdio. Always exits the
 * process: with the binary's own exit code when it runs, or 1 with an
 * actionable install hint when no binary can be found.
 */
export function runShim(args) {
  for (const candidate of resolveCandidates()) {
    const isBareName = candidate === BINARY_NAME;
    // Absolute paths are stat-checked first so a removed file doesn't throw a
    // confusing ENOENT; the bare name is left for execFileSync's PATH search.
    if (!isBareName && !existsSync(candidate)) continue;
    try {
      execFileSync(candidate, args, { stdio: "inherit" });
      process.exit(0);
    } catch (err) {
      // Found, but exited non-zero — propagate the real exit code.
      if (err.status !== null && err.status !== undefined) {
        process.exit(err.status);
      }
      // Not executable here (e.g. bare name not on PATH) — try the next one.
    }
  }
  process.stderr.write(`${INSTALL_HINT}\n`);
  process.exit(1);
}
