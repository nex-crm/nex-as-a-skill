import { describe, test, beforeAll, afterAll } from "bun:test";
import { expect } from "bun:test";
import { runNex, nexEnv } from "./helpers.ts";
import { startMockServer } from "./mock-server.ts";

let env: Record<string, string>;
let closeMock: () => void;

beforeAll(() => { const mock = startMockServer(); env = nexEnv(mock.url); closeMock = mock.close; });
afterAll(() => closeMock());

describe("crm commands", () => {
  test("crm account-brief — returns structured brief", async () => {
    const { stdout, exitCode } = await runNex(["crm", "account-brief", "rec-1"], { env });
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.name).toBe("Acme Corp");
    expect(data.open_deals).toBeTruthy();
    expect(data.warmth.score).toBe(78);
  });

  test("crm deal-brief — returns deal details", async () => {
    const { stdout, exitCode } = await runNex(["crm", "deal-brief", "deal-1"], { env });
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.stage).toBe("Negotiation");
    expect(data.value).toBe(500000);
  });

  test("crm recommend — returns next actions", async () => {
    const { stdout, exitCode } = await runNex(["crm", "recommend", "rec-1"], { env });
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.actions.length).toBe(2);
    expect(data.actions[0].confidence).toBeGreaterThan(0.9);
  });

  test("crm catchup — returns digest", async () => {
    const { stdout, exitCode } = await runNex(["crm", "catchup", "--since", "7d"], { env });
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.deals_moved.length).toBe(1);
    expect(data.new_interactions).toBe(12);
  });

  test("crm warmth — returns score", async () => {
    const { stdout, exitCode } = await runNex(["crm", "warmth", "rec-1"], { env });
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.score).toBe(78);
    expect(data.trend).toBe("stable");
  });
});
