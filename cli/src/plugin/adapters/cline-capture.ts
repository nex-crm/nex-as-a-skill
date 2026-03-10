#!/usr/bin/env node
/**
 * Cline TaskComplete hook — auto-capture to Nex.
 * Input: { taskComplete: { result: string } }
 * Output: {}
 */

import { doCapture, readStdin } from "../shared.js";

interface ClineInput {
  taskComplete?: { result?: string };
}

async function main(): Promise<void> {
  try {
    const raw = await readStdin();
    let input: ClineInput = {};
    try { input = JSON.parse(raw); } catch { /* defaults */ }

    await doCapture({ message: input.taskComplete?.result ?? "" });
    process.stdout.write("{}");
  } catch (err) {
    process.stderr.write(`[nex-cline] Capture error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.stdout.write("{}");
  }
}

main().then(() => process.exit(0)).catch(() => process.exit(0));
