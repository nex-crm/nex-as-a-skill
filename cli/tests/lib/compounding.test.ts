import { describe, expect, it, mock } from "bun:test";
import { COMPOUNDING_JOBS, COMPOUNDING_TRIGGER_TIMEOUT_MS, shouldTriggerCompounding, triggerCompounding } from "../../src/lib/compounding.ts";

describe("shouldTriggerCompounding", () => {
  it("triggers only when files were scanned and the run is not dry-run", () => {
    expect(shouldTriggerCompounding(1)).toBe(true);
    expect(shouldTriggerCompounding(0)).toBe(false);
    expect(shouldTriggerCompounding(3, true)).toBe(false);
  });
});

describe("triggerCompounding", () => {
  it("posts all compounding jobs to the trigger endpoint", async () => {
    const post = mock(async () => ({}));

    await triggerCompounding({ post });

    expect(post).toHaveBeenCalledTimes(COMPOUNDING_JOBS.length);
    expect(post.mock.calls).toEqual(
      COMPOUNDING_JOBS.map((job) => [
        "/v1/compounding/trigger",
        { job_type: job, dry_run: false },
        COMPOUNDING_TRIGGER_TIMEOUT_MS,
      ]),
    );
  });

  it("attempts every job even if one request fails", async () => {
    const post = mock(async (_path: string, body?: { job_type?: string }) => {
      if (body?.job_type === "pattern_detection") {
        throw new Error("boom");
      }
      return {};
    });

    await expect(triggerCompounding({ post })).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledTimes(COMPOUNDING_JOBS.length);
  });
});
