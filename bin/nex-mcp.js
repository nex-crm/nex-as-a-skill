#!/usr/bin/env node

/**
 * Thin shim for nex-mcp — delegates to `nex-cli mcp`.
 *
 * This entry point exists for MCP registry compatibility. Platforms like
 * Claude Desktop install MCP servers via `npx @nex-ai/nex`, which resolves to
 * this shim. The binary is fetched by scripts/postinstall.js; see
 * bin/shim-core.js for the full resolution order.
 */

import { runShim } from "./shim-core.js";

runShim(["mcp", ...process.argv.slice(2)]);
