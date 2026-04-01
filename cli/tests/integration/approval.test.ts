import { describe, test, beforeAll, afterAll } from "bun:test";
import { expect } from "bun:test";
import { runNex, nexEnv } from "./helpers.ts";
import { startMockServer } from "./mock-server.ts";

let env: Record<string, string>;
let closeMock: () => void;

beforeAll(() => { const mock = startMockServer(); env = nexEnv(mock.url); closeMock = mock.close; });
afterAll(() => closeMock());

describe("approval commands", () => {
  test("approval list — returns pending proposals", async () => {
    const { stdout, exitCode } = await runNex(["approval", "list"], { env });
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.data[0].id).toBe("prop-1");
    expect(data.data[0].status).toBe("pending");
    expect(data.data[0].risk_level).toBe("low");
  });

  test("approval approve — approves a proposal", async () => {
    const { stdout, exitCode } = await runNex(["approval", "approve", "prop-1"], { env });
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.status).toBe("approved");
  });

  test("approval reject — rejects a proposal", async () => {
    const { stdout, exitCode } = await runNex(["approval", "reject", "prop-1", "--reason", "Not now"], { env });
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.status).toBe("rejected");
  });

  test("approval history — returns audit trail", async () => {
    const { stdout, exitCode } = await runNex(["approval", "history"], { env });
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.data[0].status).toBe("executed");
  });

  test("policy get — returns policy config", async () => {
    const { stdout, exitCode } = await runNex(["policy", "get"], { env });
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.rules.length).toBe(3);
    expect(data.rules[0].trust_level).toBe("trusted_write");
  });
});
