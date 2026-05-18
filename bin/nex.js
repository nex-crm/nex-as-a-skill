#!/usr/bin/env node

/**
 * Thin shim for @nex-ai/nex — delegates all commands to the nex-cli binary.
 *
 * The binary is fetched by scripts/postinstall.js when this package is
 * installed; see bin/shim-core.js for the full resolution order.
 */

import { runShim } from "./shim-core.js";

runShim(process.argv.slice(2));
