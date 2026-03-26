import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NexClient } from "./client.js";
import { BASE_URL } from "./config.js";

type CompoundingClient = Pick<NexClient, "post">;

export const COMPOUNDING_JOBS = ["consolidation", "pattern_detection", "playbook_synthesis"] as const;
export const COMPOUNDING_TRIGGER_TIMEOUT_MS = 10_000;
export const COMPOUNDING_BACKGROUND_TIMEOUT_MS = 120_000;

const WORKER_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "compounding-worker.js",
);

/**
 * Returns whether a scan result should kick off compounding jobs.
 */
export function shouldTriggerCompounding(scanned: number, dryRun = false): boolean {
  return !dryRun && scanned > 0;
}

/**
 * Trigger compounding intelligence jobs after content ingestion.
 * Runs in the background — errors are non-fatal to the scan flow.
 */
export async function triggerCompounding(client: CompoundingClient): Promise<void> {
  await Promise.allSettled(
    COMPOUNDING_JOBS.map((job) =>
      client.post("/v1/compounding/trigger", { job_type: job, dry_run: false }, COMPOUNDING_TRIGGER_TIMEOUT_MS),
    ),
  );
}

/**
 * Launch compounding triggers in a detached worker so the caller does not wait
 * on a backend response that may hang for valid job types.
 */
export function launchBackgroundCompounding(apiKey: string): void {
  try {
    const baseUrl = typeof BASE_URL === "string" ? BASE_URL : "https://app.nex.ai";
    const child = spawn(process.execPath, [WORKER_PATH], {
      detached: true,
      env: {
        ...process.env,
        NEX_API_KEY: apiKey,
        NEX_DEV_URL: baseUrl,
        NEX_COMPOUNDING_TIMEOUT_MS: String(COMPOUNDING_BACKGROUND_TIMEOUT_MS),
      },
      stdio: "ignore" as const,
    });
    child.unref();
  } catch {
    // Ignore background trigger failures so scans remain non-fatal.
  }
}
