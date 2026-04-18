#!/usr/bin/env node

/**
 * Registration entry point — creates a Nex account and persists the API key.
 *
 * Usage: node dist/auto-register.js <email> [name] [company]
 *
 * On success: saves to workspace credentials.json and legacy ~/.nex-mcp.json.
 * If already registered (API key exists): prints status and exits.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadBaseUrl,
  loadMcpConfig,
  loadWorkspaceCredentials,
  MCP_CONFIG_PATH,
  persistRegistration,
} from "./config.js";
import { NexClient } from "./nex-client.js";
import { workspaceDataDir } from "./workspace-data-dir.js";

/** Persist credentials to the active workspace directory. */
function persistWorkspaceCredentials(data: Record<string, unknown>): void {
  const slug = typeof data.workspace_slug === "string" ? data.workspace_slug : undefined;
  if (!slug) return;

  const wsDir = workspaceDataDir();
  mkdirSync(wsDir, { recursive: true });

  const creds = {
    api_key: data.api_key,
    email: data.email,
    workspace_id:
      typeof data.workspace_id === "number" ? String(data.workspace_id) : data.workspace_id,
    workspace_slug: slug,
  };
  writeFileSync(join(wsDir, "credentials.json"), `${JSON.stringify(creds, null, 2)}\n`, "utf-8");
}

async function main(): Promise<void> {
  const email = process.argv[2];
  const name = process.argv[3];
  const company = process.argv[4];

  if (!email) {
    console.error("Usage: auto-register.js <email> [name] [company]");
    process.exit(1);
  }

  // Check if already registered — workspace credentials take priority
  const wsCreds = loadWorkspaceCredentials();
  if (wsCreds.api_key) {
    console.log("Already registered.");
    console.log(`  API key: ${wsCreds.api_key.slice(0, 12)}...`);
    console.log(`  Config: ${workspaceDataDir()}/credentials.json`);
    console.log("\nTo re-register, delete the credentials.json in your workspace directory.");
    return;
  }
  const existing = loadMcpConfig();
  if (existing.api_key) {
    console.log("Already registered.");
    console.log(`  API key: ${existing.api_key.slice(0, 12)}...`);
    console.log(`  Config: ${MCP_CONFIG_PATH}`);
    console.log("\nTo re-register, delete ~/.nex-mcp.json first.");
    return;
  }

  const baseUrl = loadBaseUrl();
  console.log(`Registering ${email} at ${baseUrl} ...`);

  try {
    const result = await NexClient.register(baseUrl, email, name, company);

    if (!result.api_key) {
      console.error("Registration succeeded but no API key returned.");
      console.error("Response:", JSON.stringify(result, null, 2));
      process.exit(1);
    }

    // Persist to workspace credentials and legacy config
    const resultData = result as Record<string, unknown>;
    persistWorkspaceCredentials(resultData);
    persistRegistration(resultData);

    console.log("Registration successful!");
    console.log(`  API key: ${result.api_key.slice(0, 12)}...`);
    if (result.workspace_slug) console.log(`  Workspace: ${result.workspace_slug}`);
    console.log(`  Saved to: ${workspaceDataDir()}/credentials.json`);
    console.log("\nAll Nex memory features are now active. No restart needed.");
  } catch (err) {
    console.error(`Registration failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
