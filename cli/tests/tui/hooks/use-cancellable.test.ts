import { describe, it, expect } from "bun:test";
import { createCtrlCHandler } from "../../../src/tui/hooks/use-cancellable.js";

// ─── createCtrlCHandler ───

describe("createCtrlCHandler", () => {
  it("returns 'pending_exit' on first idle press", () => {
    let exitCalled = false;
    const handler = createCtrlCHandler(
      () => false,
      () => { exitCalled = true; },
    );

    const result = handler.handle();
    expect(result).toBe("pending_exit");
    expect(!exitCalled).toBeTruthy();
  });

  it("exits on second idle press within window", () => {
    let exitCalled = false;
    const handler = createCtrlCHandler(
      () => false,
      () => { exitCalled = true; },
      1000,
    );

    // First press: pending
    const first = handler.handle();
    expect(first).toBe("pending_exit");
    expect(!exitCalled).toBeTruthy();

    // Second press within window: exit
    const second = handler.handle();
    expect(second).toBe("exit");
    expect(exitCalled).toBeTruthy();
  });

  it("returns 'cancelled' when cancelFn succeeds", () => {
    let exitCalled = false;
    const handler = createCtrlCHandler(
      () => true,
      () => { exitCalled = true; },
    );

    const result = handler.handle();
    expect(result).toBe("cancelled");
    expect(!exitCalled).toBeTruthy();
  });

  it("exits on press after cancel within window when nothing left to cancel", () => {
    let cancelCount = 0;
    let exitCalled = false;
    const handler = createCtrlCHandler(
      () => {
        cancelCount++;
        return cancelCount === 1; // first call cancels, second doesn't
      },
      () => { exitCalled = true; },
      1000,
    );

    // First press: cancels the operation
    const first = handler.handle();
    expect(first).toBe("cancelled");
    expect(!exitCalled).toBeTruthy();

    // Second press within 1s: nothing to cancel → exit
    const second = handler.handle();
    expect(second).toBe("exit");
    expect(exitCalled).toBeTruthy();
  });

  it("uses custom window duration", () => {
    let cancelCount = 0;
    let exitCalled = false;
    const handler = createCtrlCHandler(
      () => {
        cancelCount++;
        return cancelCount === 1;
      },
      () => { exitCalled = true; },
      50,
    );

    handler.handle(); // cancel
    expect(!exitCalled).toBeTruthy();

    // Second press immediately (within 50ms): exit
    handler.handle();
    expect(exitCalled).toBeTruthy();
  });

  it("resets to pending_exit after window expires", async () => {
    let exitCalled = false;
    const handler = createCtrlCHandler(
      () => false,
      () => { exitCalled = true; },
      50, // 50ms window
    );

    // First press: pending
    handler.handle();
    expect(!exitCalled).toBeTruthy();

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 100));

    // Press again after window: should be pending again, not exit
    const result = handler.handle();
    expect(result).toBe("pending_exit");
    expect(!exitCalled).toBeTruthy();
  });
});
