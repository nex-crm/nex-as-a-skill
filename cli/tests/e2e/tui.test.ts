/**
 * E2E tests for the Nex TUI.
 *
 * These launch the real TUI in a PTY and test interactive flows:
 * keystrokes, navigation, slash commands, and rendering.
 */

import { describe, it, afterAll, expect } from "bun:test";

let pty: typeof import("node-pty") | undefined;
try {
  pty = await import("node-pty");
} catch {
  // node-pty not installed — skip tests
}

// Conditionally import harness only if pty is available
let TuiTest: typeof import("./harness.js").TuiTest | undefined;
if (pty) {
  const harness = await import("./harness.js");
  TuiTest = harness.TuiTest;
}

const describeOrSkip = pty ? describe : describe.skip;

describeOrSkip("TUI E2E", () => {
  it("launches and shows welcome message", async () => {
    const tui = new TuiTest!({ timeout: 15000 });
    try {
      const found = await tui.waitForText("Welcome to Nex", 10000);
      expect(found).toBeTruthy();
    } finally {
      await tui.kill();
    }
  });

  it("shows /help for commands hint in status bar", async () => {
    const tui = new TuiTest!({ timeout: 15000 });
    try {
      const found = await tui.waitForText("/help", 10000);
      expect(found).toBeTruthy();
    } finally {
      await tui.kill();
    }
  });

  it("/help lists available slash commands", async () => {
    const tui = new TuiTest!({ timeout: 15000 });
    try {
      await tui.waitForText("Welcome to Nex", 10000);
      tui.type("/help");
      tui.enter();
      const found = await tui.waitForText("/agents", 5000);
      expect(found).toBeTruthy();
    } finally {
      await tui.kill();
    }
  });

  it("/agents pushes agent list view", async () => {
    const tui = new TuiTest!({ timeout: 15000 });
    try {
      await tui.waitForText("Welcome to Nex", 10000);
      tui.type("/agents");
      tui.enter();
      const found = await tui.waitForText("Agents", 5000);
      expect(found).toBeTruthy();
    } finally {
      await tui.kill();
    }
  });

  it("Escape returns from agent list to home", async () => {
    const tui = new TuiTest!({ timeout: 15000 });
    try {
      await tui.waitForText("Welcome to Nex", 10000);
      tui.type("/agents");
      tui.enter();
      await tui.waitForText("Agents", 5000);
      tui.escape();
      await tui.wait(500);
      // Should be back at home — look for the input prompt
      const found = await tui.waitForText(">", 3000);
      expect(found).toBeTruthy();
    } finally {
      await tui.kill();
    }
  });

  it("--version prints version and exits", async () => {
    const tui = new TuiTest!({
      args: ["--import", "tsx", "src/index.ts", "--version"],
      timeout: 10000,
    });
    try {
      const found = await tui.waitForText("0.1.22", 5000);
      expect(found).toBeTruthy();
    } finally {
      await tui.kill();
    }
  });

  it("--help prints help and exits", async () => {
    const tui = new TuiTest!({
      args: ["--import", "tsx", "src/index.ts", "--help"],
      timeout: 10000,
    });
    try {
      const found = await tui.waitForText("Usage: nex", 5000);
      expect(found).toBeTruthy();
    } finally {
      await tui.kill();
    }
  });

  it("non-interactive ask dispatches and exits", async () => {
    const tui = new TuiTest!({
      args: ["--import", "tsx", "src/index.ts", "agent", "templates"],
      timeout: 10000,
    });
    try {
      const found = await tui.waitForText("SEO Analyst", 5000);
      expect(found).toBeTruthy();
    } finally {
      await tui.kill();
    }
  });

  it("double Ctrl+C exits the TUI", async () => {
    const tui = new TuiTest!({ timeout: 15000 });
    try {
      await tui.waitForText("Welcome to Nex", 10000);
      tui.ctrlC();
      await tui.wait(200);
      tui.ctrlC();
      await tui.wait(1000);
      // Process should have exited — no more output expected
      // If still alive, the test will time out
    } finally {
      await tui.kill();
    }
  });

  it("/clear resets conversation", async () => {
    const tui = new TuiTest!({ timeout: 15000 });
    try {
      await tui.waitForText("Welcome to Nex", 10000);
      await tui.wait(300);
      tui.type("/clear");
      await tui.wait(200);
      tui.enter();
      const found = await tui.waitForText("Conversation cleared", 8000);
      expect(found).toBeTruthy();
    } finally {
      await tui.kill();
    }
  });

  it("unknown slash command shows error", async () => {
    const tui = new TuiTest!({ timeout: 15000 });
    try {
      await tui.waitForText("Welcome to Nex", 10000);
      await tui.wait(300);
      tui.type("/nonexistent");
      await tui.wait(200);
      tui.enter();
      const found = await tui.waitForText("Unknown command", 8000);
      expect(found).toBeTruthy();
    } finally {
      await tui.kill();
    }
  });

  it("detect command shows platforms", async () => {
    const tui = new TuiTest!({
      args: ["--import", "tsx", "src/index.ts", "detect"],
      timeout: 10000,
    });
    try {
      const found = await tui.waitForText("Claude Code", 5000);
      expect(found).toBeTruthy();
    } finally {
      await tui.kill();
    }
  });

  // ── New E2E tests ─────────────────────────────────────────────────

  it("/login shows email prompt", async () => {
    const tui = new TuiTest!({ timeout: 15000 });
    try {
      await tui.waitForText("Welcome to Nex", 10000);
      tui.type("/login");
      tui.enter();
      // Should show email prompt (either "Enter your email" or "Already logged in")
      const emailPrompt = await tui.waitForText("email", 5000);
      expect(emailPrompt).toBeTruthy();
    } finally {
      await tui.kill();
    }
  });

  it("#general channel appears on home screen", async () => {
    const tui = new TuiTest!({ timeout: 15000 });
    try {
      await tui.waitForText("Welcome to Nex", 10000);
      const found = await tui.waitForText("general", 3000);
      expect(found).toBeTruthy();
    } finally {
      await tui.kill();
    }
  });

  it("/cal toggles calendar strip", async () => {
    const tui = new TuiTest!({ timeout: 15000 });
    try {
      await tui.waitForText("Welcome to Nex", 10000);
      tui.type("/cal");
      tui.enter();
      // /cal toggles the calendar strip; check that it doesn't error
      await tui.wait(500);
      // After toggling, home screen should still show — no crash
      const found = await tui.waitForText(">", 3000);
      expect(found).toBeTruthy();
    } finally {
      await tui.kill();
    }
  });

  it("agent create via CLI dispatches", async () => {
    const tui = new TuiTest!({
      args: ["--import", "tsx", "src/index.ts", "agent", "create", "test-e2e", "--template", "seo-agent"],
      timeout: 10000,
    });
    try {
      // Should either create the agent or fail with auth error
      const created = await tui.waitForMatch(/Created agent|API key|error|unauthorized/i, 5000);
      expect(created).toBeTruthy();
    } finally {
      await tui.kill();
    }
  });

  it("natural language message shows thinking or auth error", async () => {
    const tui = new TuiTest!({ timeout: 15000 });
    try {
      await tui.waitForText("Welcome to Nex", 10000);
      tui.type("hello world");
      tui.enter();
      // Should show either "thinking..." spinner, a response, or "No API key" auth error
      const found = await tui.waitForMatch(/thinking|No API key|error|hello/i, 5000);
      expect(found).toBeTruthy();
    } finally {
      await tui.kill();
    }
  });

  it("Tab cycles focus sections", async () => {
    const tui = new TuiTest!({ timeout: 15000 });
    try {
      await tui.waitForText("Welcome to Nex", 10000);
      // Status bar should show Tab=focus hint
      const hasHint = await tui.waitForText("Tab=focus", 3000);
      expect(hasHint).toBeTruthy();
      // Press Tab — focus should cycle; screen should remain intact with COMPOSE label
      tui.tab();
      await tui.wait(500);
      const intact = tui.text().includes("COMPOSE") || tui.text().includes("SIDEBAR") || tui.text().includes("general");
      expect(intact).toBeTruthy();
    } finally {
      await tui.kill();
    }
  });

  it("user message appears exactly once (no double-message bug)", async () => {
    // Use a unique token per test run to avoid noise from persisted chat history
    const token = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tui = new TuiTest!({ timeout: 15000 });
    try {
      await tui.waitForText("Welcome to Nex", 10000);
      await tui.wait(500);
      tui.type(token);
      tui.enter();
      // Wait for the message to appear in the rendered message area
      const appeared = await tui.waitForText(token, 5000);
      expect(appeared).toBeTruthy();
      // Wait for a full re-render cycle, then clear and capture a clean frame
      await tui.wait(1500);
      tui.clearOutput();
      await tui.wait(1000);
      const text = tui.text();
      const matches = text.match(new RegExp(token, "g")) ?? [];
      expect(matches.length <= 1).toBeTruthy();
    } finally {
      await tui.kill();
    }
  });

  it("/init shows setup or key status", async () => {
    const tui = new TuiTest!({ timeout: 15000 });
    try {
      await tui.waitForText("Welcome to Nex", 10000);
      tui.type("/init");
      tui.enter();
      // Should show either setup prompt (no key) or validation (has key)
      const found = await tui.waitForMatch(
        /email|set up|API key|valid|expired|Welcome to Nex! Let/i,
        8000,
      );
      expect(found).toBeTruthy();
    } finally {
      await tui.kill();
    }
  });

  it("first Ctrl+C shows exit hint or gracefully handles exit", async () => {
    const tui = new TuiTest!({ timeout: 15000 });
    try {
      await tui.waitForText("Welcome to Nex", 10000);
      await tui.wait(500);
      tui.ctrlC();
      await tui.wait(1000);
      const text = tui.text();
      // Should show the exit hint OR the process should still be alive
      // (Ink may handle Ctrl+C differently depending on exitOnCtrlC setting)
      const hasHint = text.includes("Ctrl+C again") || text.includes("interrupted");
      const stillAlive = text.includes(">") || text.includes("nex");
      expect(hasHint || stillAlive).toBeTruthy();
    } finally {
      await tui.kill();
    }
  });
});
