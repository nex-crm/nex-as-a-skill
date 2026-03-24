#!/usr/bin/env node

/**
 * Thin shim for nex-mcp — delegates to nex-cli mcp.
 *
 * This entry point exists for MCP registry compatibility.
 * Platforms like Claude Desktop install MCP servers via: npx @nex-ai/nex
 * which resolves to this shim, which delegates to the nex-cli binary.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const args = ["mcp", ...process.argv.slice(2)];

function tryExec(command, commandArgs) {
  try {
    execFileSync(command, commandArgs, { stdio: "inherit" });
    return true;
  } catch (err) {
    if (err.status !== null && err.status !== undefined) {
      process.exit(err.status);
    }
    return false;
  }
}

if (tryExec("nex-cli", args)) {
  process.exit(0);
}

const commonPaths = ["/usr/local/bin/nex-cli", `${process.env.HOME}/.local/bin/nex-cli`];
for (const p of commonPaths) {
  if (existsSync(p) && tryExec(p, args)) {
    process.exit(0);
  }
}

console.error(`
  nex-cli binary not found.

  Install it with:
    curl -fsSL https://raw.githubusercontent.com/nex-crm/nex-cli/main/install.sh | sh

  Then run your command again.
`);
process.exit(1);
