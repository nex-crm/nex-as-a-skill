#!/usr/bin/env node

import { NexClient } from "./client.js";
import { triggerCompounding, COMPOUNDING_BACKGROUND_TIMEOUT_MS } from "./compounding.js";

/**
 * Run compounding triggers in a detached process so the parent CLI command can
 * exit immediately even when the backend keeps the HTTP response open.
 */
async function main(): Promise<void> {
  const apiKey = process.env.NEX_API_KEY;
  if (!apiKey) {
    return;
  }

  const rawTimeout = Number.parseInt(process.env.NEX_COMPOUNDING_TIMEOUT_MS ?? "", 10);
  const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0
    ? rawTimeout
    : COMPOUNDING_BACKGROUND_TIMEOUT_MS;

  const client = new NexClient(apiKey, timeoutMs);
  await triggerCompounding(client);
}

main().then(() => process.exit(0)).catch(() => process.exit(0));
