import { describe, test, beforeAll, afterAll } from "bun:test";
import { expect } from "bun:test";
import { runNex, nexEnv } from "./helpers.ts";
import { startMockServer } from "./mock-server.ts";

let env: Record<string, string>;
let closeMock: () => void;

beforeAll(() => { const mock = startMockServer(); env = nexEnv(mock.url); closeMock = mock.close; });
afterAll(() => closeMock());

describe("pipeline commands", () => {
  test("pipeline get — returns stages with deals", async () => {
    const { stdout, exitCode } = await runNex(["pipeline", "get"], { env });
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.stages.length).toBe(4);
    expect(data.total_value).toBe(2950000);
  });

  test("pipeline move — moves deal to new stage", async () => {
    const { stdout, exitCode } = await runNex(["pipeline", "move", "--deal-id", "deal-1", "--stage", "Closed Won"], { env });
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.status).toBe("moved");
    expect(data.new_stage).toBe("Closed Won");
  });

  test("pipeline forecast — returns revenue forecast", async () => {
    const { stdout, exitCode } = await runNex(["pipeline", "forecast"], { env });
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.projected_revenue).toBe(850000);
    expect(data.deals_closing).toBe(3);
  });

  test("action execute — executes an action", async () => {
    const { stdout, exitCode } = await runNex(
      ["action", "execute", "--type", "internal", "--operation", "create_task"],
      { env },
    );
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.status).toBe("executed");
  });
});
