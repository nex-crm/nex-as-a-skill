#!/usr/bin/env node

/**
 * Thin shim for @nex-ai/nex — delegates all commands to the nex-cli binary.
 *
 * Install the binary: curl -fsSL https://raw.githubusercontent.com/nex-crm/nex-cli/main/install.sh | sh
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);

// Try nex-cli on PATH first
function tryExec(command, commandArgs) {
  try {
    execFileSync(command, commandArgs, { stdio: "inherit" });
    return true;
  } catch (err) {
    // If the command was found but returned non-zero, propagate the exit code
    if (err.status !== null && err.status !== undefined) {
      process.exit(err.status);
    }
    return false;
  }
}

// 1. Try nex-cli directly (installed via curl | sh)
if (tryExec("nex-cli", args)) {
  process.exit(0);
}

// 2. Try common install locations
const commonPaths = ["/usr/local/bin/nex-cli", `${process.env.HOME}/.local/bin/nex-cli`];
for (const p of commonPaths) {
  if (existsSync(p) && tryExec(p, args)) {
    process.exit(0);
  }
}

// 3. Not found — show install instructions
console.error(`
  nex-cli binary not found.

  Install it with:
    curl -fsSL https://raw.githubusercontent.com/nex-crm/nex-cli/main/install.sh | sh

  Then run your command again.
`);
process.exit(1);
