import { describe, test, expect } from "bun:test";
import { shouldRecall } from "../../src/lib/recall-filter.ts";

describe("shouldRecall", () => {
  test("recalls on first prompt when message is long enough", () => {
    const result = shouldRecall("anything at all", true);
    expect(result.shouldRecall).toBe(true);
    expect(result.reason).toBe("first-prompt");
  });

  test("skips when prompt starts with !", () => {
    const result = shouldRecall("!do something without recall", false);
    expect(result.shouldRecall).toBe(false);
    expect(result.reason).toBe("opt-out");
  });

  test("skips when prompt is too short", () => {
    const result = shouldRecall("short", false);
    expect(result.shouldRecall).toBe(false);
    expect(result.reason).toBe("too-short");
  });

  test("still skips short first prompts", () => {
    const result = shouldRecall("thanks", true);
    expect(result.shouldRecall).toBe(false);
    expect(result.reason).toBe("too-short");
  });

  test("skips bare shell commands", () => {
    const result = shouldRecall("git status --short", false);
    expect(result.shouldRecall).toBe(false);
    expect(result.reason).toBe("bare-shell-command");
  });

  test("skips bare package-manager commands", () => {
    const result = shouldRecall("bun test tests/lib/recall-filter.test.ts", false);
    expect(result.shouldRecall).toBe(false);
    expect(result.reason).toBe("bare-shell-command");
  });

  test("recalls normal questions", () => {
    const result = shouldRecall("What is the status of my contacts?", false);
    expect(result.shouldRecall).toBe(true);
    expect(result.reason).toBe("default");
  });

  test("recalls tool-style prompts", () => {
    const result = shouldRecall("run the build script for production", false);
    expect(result.shouldRecall).toBe(true);
    expect(result.reason).toBe("default");
  });

  test("recalls code and file-reference prompts", () => {
    const result = shouldRecall("src/lib/config.ts:42 => { a: 1, b: 2 }", false);
    expect(result.shouldRecall).toBe(true);
    expect(result.reason).toBe("default");
  });

  test("recalls ordinary non-question prompts", () => {
    const result = shouldRecall("please check the Slack thread for Acme context", false);
    expect(result.shouldRecall).toBe(true);
    expect(result.reason).toBe("default");
  });

  test("recalls natural-language coding prompts", () => {
    const result = shouldRecall("run the build script for production", false);
    expect(result.shouldRecall).toBe(true);
    expect(result.reason).toBe("default");
  });
});
