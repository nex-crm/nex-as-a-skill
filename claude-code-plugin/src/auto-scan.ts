#!/usr/bin/env node
/**
 * Standalone entry point for the /nex:scan slash command.
 *
 * Reads optional directory from argv[2] or stdin, scans for project files,
 * and ingests changed ones into Nex. Prints results to stdout.
 *
 * Usage: node dist/auto-scan.js [directory]
 */

import type { NexConfig } from "./config.js";
import { loadConfig, loadScanConfig } from "./config.js";
import { markScanned, readManifest, writeManifest } from "./file-manifest.js";
import { scanAndIngest } from "./file-scanner.js";
import { NexClient } from "./nex-client.js";
import { RateLimiter } from "./rate-limiter.js";

async function main(): Promise<void> {
  try {
    // Determine target directory: argv[2] > cwd
    const targetDir = process.argv[2] || process.cwd();

    let cfg: NexConfig;
    try {
      cfg = loadConfig();
    } catch (err) {
      console.error(`Config error: ${err instanceof Error ? err.message : String(err)}`);
      // The bare `return` is here because the plugin sub-packages don't
      // install @types/node, so TS can't see that `process.exit(1)` is
      // `never`. Without the return, `cfg` below would be flagged as
      // possibly-unassigned.
      process.exit(1);
      return;
    }

    const scanConfig = loadScanConfig();
    if (!scanConfig.enabled) {
      console.log("File scanning is disabled (NEX_SCAN_ENABLED=false).");
      return;
    }

    const client = new NexClient(cfg.apiKey, cfg.baseUrl);
    const rateLimiter = new RateLimiter();

    console.log(`Scanning ${targetDir} ...`);
    const result = await scanAndIngest(client, rateLimiter, targetDir, scanConfig);

    // Mark scan time so session start can skip if fresh
    const manifest = readManifest();
    markScanned(manifest);
    writeManifest(manifest);

    console.log(`Scan complete:`);
    console.log(`  Scanned: ${result.scanned} files`);
    console.log(`  Ingested: ${result.ingested} files`);
    console.log(`  Skipped: ${result.skipped} files (unchanged)`);
    if (result.errors > 0) {
      console.log(`  Errors: ${result.errors}`);
    }
  } catch (err) {
    console.error(`Scan failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
