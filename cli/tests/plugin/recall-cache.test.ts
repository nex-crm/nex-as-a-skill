import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RecallCache, hashPrompt } from "../../src/plugin/recall-cache.ts";

describe("RecallCache", () => {
  let tmpDir: string;
  let cache: RecallCache;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "nex-recall-cache-test-"));
    cache = new RecallCache({ dataDir: tmpDir });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("tracks pending prompts by session", () => {
    const promptHash = hashPrompt("let's push a new npm package");
    cache.setPending("session-1", promptHash, 1_000);

    expect(cache.hasPending("session-1", promptHash, 5_000, 2_000)).toBe(true);
    expect(cache.hasPending("session-1", hashPrompt("different"), 5_000, 2_000)).toBe(false);
  });

  test("clears stale pending entries", () => {
    const promptHash = hashPrompt("let's push a new npm package");
    cache.setPending("session-1", promptHash, 1_000);

    expect(cache.hasPending("session-1", promptHash, 500, 2_000)).toBe(false);
    expect(cache.get("session-1")).toBe(undefined);
  });

  test("stores a ready entry separately from pending work", () => {
    const readyHash = hashPrompt("prompt-a");
    const pendingHash = hashPrompt("prompt-b");

    cache.setReady("session-1", { promptHash: readyHash, context: "ready context" }, 1_000);
    cache.setPending("session-1", pendingHash, 1_100);

    expect(cache.getInjectable("session-1", 5_000, 2_000)?.context).toBe("ready context");
    expect(cache.hasPending("session-1", pendingHash, 5_000, 2_000)).toBe(true);
  });

  test("delivers a ready entry only once", () => {
    const promptHash = hashPrompt("prompt-a");
    cache.setReady("session-1", { promptHash, context: "ready context" }, 1_000);

    expect(cache.getInjectable("session-1", 5_000, 2_000)?.context).toBe("ready context");
    expect(cache.markReadyDelivered("session-1", 2_100)).toBe(true);
    expect(cache.getInjectable("session-1", 5_000, 2_200)).toBe(undefined);
  });

  test("replaces ready state and clears matching pending state", () => {
    const promptHash = hashPrompt("prompt-a");
    cache.setPending("session-1", promptHash, 1_000);
    cache.setReady("session-1", { promptHash, context: "ready context" }, 1_500);

    expect(cache.hasPending("session-1", promptHash, 5_000, 2_000)).toBe(false);
    expect(cache.getInjectable("session-1", 5_000, 2_000)?.context).toBe("ready context");
  });

  test("drops stale ready entries", () => {
    const promptHash = hashPrompt("prompt-a");
    cache.setReady("session-1", { promptHash, context: "ready context" }, 1_000);

    expect(cache.getInjectable("session-1", 500, 2_000)).toBe(undefined);
    expect(cache.get("session-1")).toBe(undefined);
  });
});
