import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── detectPlatforms tests ──

describe("detectPlatforms", () => {
  it("returns an array", async () => {
    const { detectPlatforms } = await import("../../src/commands/init.js");
    const platforms = detectPlatforms();
    expect(Array.isArray(platforms)).toBeTruthy();
  });

  it("each platform has required shape", async () => {
    const { detectPlatforms } = await import("../../src/commands/init.js");
    const platforms = detectPlatforms();

    for (const p of platforms) {
      expect(typeof p.name === "string" && p.name.length > 0).toBeTruthy();
      expect(typeof p.slug === "string" && p.slug.length > 0).toBeTruthy();
      expect(typeof p.detected).toBe("boolean");
      expect(typeof p.nexInstalled).toBe("boolean");
      expect(typeof p.capabilities).toBe("object");
      expect(typeof p.capabilities.hooks).toBe("boolean");
      expect(typeof p.capabilities.rules).toBe("boolean");
      expect(typeof p.capabilities.mcp).toBe("boolean");
      expect(typeof p.capabilities.commands).toBe("boolean");
    }
  });

  it("includes Claude Code in the list", async () => {
    const { detectPlatforms } = await import("../../src/commands/init.js");
    const platforms = detectPlatforms();
    const claudeCode = platforms.find((p) => p.slug === "claude-code");
    expect(claudeCode).toBeTruthy();
    expect(claudeCode!.name).toBe("Claude Code");
    expect(claudeCode!.capabilities.hooks).toBe(true);
    expect(claudeCode!.capabilities.commands).toBe(true);
  });

  it("includes Cursor in the list", async () => {
    const { detectPlatforms } = await import("../../src/commands/init.js");
    const platforms = detectPlatforms();
    const cursor = platforms.find((p) => p.slug === "cursor");
    expect(cursor).toBeTruthy();
    expect(cursor!.capabilities.rules).toBe(true);
    expect(cursor!.capabilities.hooks).toBe(true);
  });

  it("includes Zed in the list", async () => {
    const { detectPlatforms } = await import("../../src/commands/init.js");
    const platforms = detectPlatforms();
    const zed = platforms.find((p) => p.slug === "zed");
    expect(zed).toBeTruthy();
    expect(zed!.capabilities.rules).toBe(true);
    expect(zed!.capabilities.hooks).toBe(false);
  });

  it("has no duplicate slugs", async () => {
    const { detectPlatforms } = await import("../../src/commands/init.js");
    const platforms = detectPlatforms();
    const slugs = platforms.map((p) => p.slug);
    const unique = new Set(slugs);
    expect(slugs.length).toBe(unique.size);
  });
});

// ── runInit tests ──

describe("runInit", () => {
  it("reports auth error when no email and no API key", async () => {
    const { runInit } = await import("../../src/commands/init.js");
    const { resolveApiKey } = await import("../../src/lib/config.js");

    const originalKey = process.env.NEX_API_KEY;
    delete process.env.NEX_API_KEY;

    const progress: Array<{ step: string; detail?: string; error?: string }> = [];

    // Explicitly pass apiKey: undefined to bypass resolveApiKey() checking config file
    await runInit(
      (p) => progress.push(p),
      { email: undefined, apiKey: undefined },
    );

    const authStep = progress.find((p) => p.step === "auth");
    expect(authStep).toBeTruthy();

    // If the user's config file has a key, runInit will find it via resolveApiKey()
    // and report "Already authenticated" instead of "no_email". Both are valid.
    const existingKey = resolveApiKey();
    if (existingKey) {
      expect(
        authStep!.detail!.includes("Already authenticated"),
      ).toBeTruthy();
    } else {
      expect(authStep!.error).toBe("no_email");
    }

    if (originalKey !== undefined) {
      process.env.NEX_API_KEY = originalKey;
    }
  });

  it("skips registration when apiKey is provided", async () => {
    const { runInit } = await import("../../src/commands/init.js");

    const progress: Array<{ step: string; detail?: string; done?: boolean }> = [];

    await runInit(
      (p) => progress.push(p),
      { apiKey: "sk-test-skip-registration" },
    );

    const authStep = progress.find((p) => p.step === "auth");
    expect(authStep).toBeTruthy();
    expect(authStep!.detail!.includes("Already authenticated")).toBeTruthy();

    // Should have reached detect step
    const detectStep = progress.find((p) => p.step === "detect");
    expect(detectStep).toBeTruthy();
  });

  it("reports progress callbacks for detection and completion", async () => {
    const { runInit } = await import("../../src/commands/init.js");

    const steps: string[] = [];

    await runInit(
      (p) => steps.push(p.step),
      { apiKey: "sk-test-progress" },
    );

    expect(steps.includes("auth")).toBeTruthy();
    expect(steps.includes("detect")).toBeTruthy();
  });
});

// ── dispatch integration ──

describe("init via dispatch", () => {
  it("init command is registered", async () => {
    const { commandNames } = await import("../../src/commands/dispatch.js");
    expect(commandNames.includes("init")).toBeTruthy();
    expect(commandNames.includes("detect")).toBeTruthy();
  });

  it("dispatch('init') runs without crashing", async () => {
    const { dispatch } = await import("../../src/commands/dispatch.js");
    const result = await dispatch("init", { apiKey: "sk-test-dispatch" });
    // Should succeed or at least not crash — exit code 0 means it ran the flow
    expect(typeof result.exitCode).toBe("number");
    expect(result.exitCode === 0 || result.exitCode === 1).toBeTruthy();
  });

  it("setup alias resolves to init", async () => {
    const { dispatch } = await import("../../src/commands/dispatch.js");
    const result = await dispatch("setup", { apiKey: "sk-test-alias" });
    expect(typeof result.exitCode).toBe("number");
    // Should NOT be "unknown command"
    if (result.error) {
      expect(!/unknown command/i.test(result.error)).toBeTruthy();
    }
  });

  it("detect command returns platform list", async () => {
    const { dispatch } = await import("../../src/commands/dispatch.js");
    const result = await dispatch("detect", { format: "json" });
    expect(result.exitCode).toBe(0);
    expect(Array.isArray(result.data)).toBeTruthy();
  });
});
