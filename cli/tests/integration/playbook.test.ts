import { describe, test, beforeAll, afterAll } from "bun:test";
import { expect } from "bun:test";
import { runNex, nexEnv } from "./helpers.ts";
import { startMockServer } from "./mock-server.ts";

let env: Record<string, string>;
let closeMock: () => void;

beforeAll(() => {
  const mock = startMockServer();
  env = nexEnv(mock.url);
  closeMock = mock.close;
});

afterAll(() => closeMock());

describe("playbook commands", () => {
  test("playbook list — returns entity briefs", async () => {
    const { stdout, exitCode } = await runNex(["playbook", "list"], { env });
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.data).toBeTruthy();
    expect(data.data.length).toBe(1);
    expect(data.data[0].id).toBe("pb-1");
  });

  test("playbook get — returns a single brief with content", async () => {
    const { stdout, exitCode } = await runNex(["playbook", "get", "pb-1"], { env });
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.id).toBe("pb-1");
    expect(data.content).toContain("Acme Corp");
    expect(data.version).toBe(2);
  });

  test("playbook get — returns 404 for unknown ID", async () => {
    const { exitCode } = await runNex(["playbook", "get", "nonexistent"], { env });
    expect(exitCode).not.toBe(0);
  });

  test("playbook workspace — lists workspace playbooks", async () => {
    const { stdout, exitCode } = await runNex(["playbook", "workspace"], { env });
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.data).toBeTruthy();
    expect(data.data[0].slug).toBe("enterprise-churn-prevention");
  });

  test("playbook history — returns version events with diffs", async () => {
    const { stdout, exitCode } = await runNex(["playbook", "history", "pb-1"], { env });
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.events).toBeTruthy();
    expect(data.events.length).toBe(2);
    expect(data.events[0].diff_summary).toContain("Q1 revenue");
  });

  test("playbook compile — triggers compilation", async () => {
    const { stdout, exitCode } = await runNex(
      ["playbook", "compile", "--entity-id", "rec-1"],
      { env },
    );
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.status).toBe("queued");
  });
});
