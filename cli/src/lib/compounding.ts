import type { NexClient } from "./client.js";

type CompoundingClient = Pick<NexClient, "post">;

export const COMPOUNDING_JOBS = ["consolidation", "pattern_detection", "playbook_synthesis"] as const;
export const COMPOUNDING_TRIGGER_TIMEOUT_MS = 10_000;

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
