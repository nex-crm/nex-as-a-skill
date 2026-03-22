import { describe, test, expect, afterAll, beforeEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runNex } from "./helpers.ts";

// Setup a temp ~/.nex dir for testing
const TEST_NEX_DIR = join(import.meta.dir, "../../.test-nex-integration");

function setupWorkspace(slug: string, email: string, apiKey: string) {
  const wsDir = join(TEST_NEX_DIR, "workspaces", slug);
  mkdirSync(wsDir, { recursive: true });
  writeFileSync(join(wsDir, "credentials.json"), JSON.stringify({
    api_key: apiKey, email, workspace_id: "123", workspace_slug: slug,
  }));
}

function setupRegistry(active: string, workspaces: Record<string, { nickname?: string }>) {
  mkdirSync(TEST_NEX_DIR, { recursive: true });
  const reg: Record<string, unknown> = {
    active_workspace: active,
    workspaces: Object.fromEntries(
      Object.entries(workspaces).map(([slug, meta]) => [slug, { ...meta, added_at: Date.now() }])
    ),
  };
  writeFileSync(join(TEST_NEX_DIR, "config.json"), JSON.stringify(reg, null, 2));
}

beforeEach(() => {
  rmSync(TEST_NEX_DIR, { recursive: true, force: true });
});

afterAll(() => {
  rmSync(TEST_NEX_DIR, { recursive: true, force: true });
});

describe("nex workspace current", () => {
  test("shows active workspace info", async () => {
    setupRegistry("ws1", { ws1: { nickname: "Personal" } });
    setupWorkspace("ws1", "test@test.com", "sk-123");

    const { stdout, exitCode } = await runNex(
      ["workspace", "current"],
      { env: { NEX_BASE_DIR: TEST_NEX_DIR } },
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("ws1");
    expect(stdout).toContain("test@test.com");
  }, 15_000);
});

describe("nex workspace switch", () => {
  test("switches to specified workspace", async () => {
    setupRegistry("ws1", { ws1: {}, ws2: { nickname: "Team" } });
    setupWorkspace("ws1", "a@test.com", "sk-1");
    setupWorkspace("ws2", "b@test.com", "sk-2");

    const { exitCode } = await runNex(
      ["workspace", "switch", "ws2"],
      { env: { NEX_BASE_DIR: TEST_NEX_DIR } },
    );
    expect(exitCode).toBe(0);

    const config = JSON.parse(readFileSync(join(TEST_NEX_DIR, "config.json"), "utf-8"));
    expect(config.active_workspace).toBe("ws2");
  }, 15_000);

  test("errors on unknown slug", async () => {
    setupRegistry("ws1", { ws1: {} });
    setupWorkspace("ws1", "a@test.com", "sk-1");

    const { exitCode, stderr } = await runNex(
      ["workspace", "switch", "nonexistent"],
      { env: { NEX_BASE_DIR: TEST_NEX_DIR } },
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("not found");
  }, 15_000);
});

describe("nex workspace rename", () => {
  test("renames workspace nickname", async () => {
    setupRegistry("ws1", { ws1: { nickname: "Old Name" } });
    setupWorkspace("ws1", "a@test.com", "sk-1");

    const { exitCode } = await runNex(
      ["workspace", "rename", "ws1", "New Name"],
      { env: { NEX_BASE_DIR: TEST_NEX_DIR } },
    );
    expect(exitCode).toBe(0);

    const config = JSON.parse(readFileSync(join(TEST_NEX_DIR, "config.json"), "utf-8"));
    expect(config.workspaces.ws1.nickname).toBe("New Name");
  }, 15_000);
});
