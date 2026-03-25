import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentService } from "../../../src/tui/services/agent-service.js";
import { ToolRegistry } from "../../../src/agent/tools.js";
import { AgentSessionStore } from "../../../src/agent/session-store.js";
import { MessageQueues } from "../../../src/agent/queues.js";
import type { AgentConfig } from "../../../src/agent/types.js";

describe("AgentService", () => {
  let tmpDir: string;
  let toolRegistry: ToolRegistry;
  let sessionStore: AgentSessionStore;
  let queues: MessageQueues;
  let service: AgentService;

  const testConfig: AgentConfig = {
    slug: "test-agent",
    name: "Test Agent",
    expertise: ["testing", "validation"],
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "nex-agent-svc-test-"));
    toolRegistry = new ToolRegistry();
    sessionStore = new AgentSessionStore(tmpDir);
    queues = new MessageQueues();
    service = new AgentService(toolRegistry, sessionStore, queues);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── create ────────────────────────────────────────────────────

  it("create() adds agent to the service", () => {
    const managed = service.create(testConfig);
    expect(managed.config.slug).toBe("test-agent");
    expect(managed.config.name).toBe("Test Agent");
    expect(managed.config.expertise).toEqual(["testing", "validation"]);
    expect(managed.state.phase).toBe("idle");
  });

  it("create() returns the managed agent", () => {
    const managed = service.create(testConfig);
    expect(managed.loop).toBeTruthy();
    expect(managed.config).toBeTruthy();
    expect(managed.state).toBeTruthy();
  });

  it("create() throws if slug already exists", () => {
    service.create(testConfig);
    expect(
      () => service.create(testConfig),
    ).toThrow();
  });

  // ── createFromTemplate ────────────────────────────────────────

  it("createFromTemplate() uses template config", () => {
    const managed = service.createFromTemplate("my-seo", "seo-agent");
    expect(managed.config.slug).toBe("my-seo");
    expect(managed.config.name).toBe("SEO Analyst");
    expect(managed.config.expertise.includes("seo")).toBeTruthy();
  });

  it("createFromTemplate() throws for unknown template", () => {
    expect(
      () => service.createFromTemplate("x", "nonexistent"),
    ).toThrow(/Unknown template/);
  });

  // ── list / get / getState ─────────────────────────────────────

  it("list() returns all agents", () => {
    expect(service.list().length).toBe(0);
    service.create(testConfig);
    service.create({ slug: "agent-2", name: "Agent 2", expertise: ["other"] });
    expect(service.list().length).toBe(2);
  });

  it("get() returns agent by slug", () => {
    service.create(testConfig);
    const managed = service.get("test-agent");
    expect(managed).toBeTruthy();
    expect(managed.config.name).toBe("Test Agent");
  });

  it("get() returns undefined for unknown slug", () => {
    expect(service.get("nope")).toBe(undefined);
  });

  it("getState() returns current state snapshot", () => {
    service.create(testConfig);
    const state = service.getState("test-agent");
    expect(state).toBeTruthy();
    expect(state.phase).toBe("idle");
  });

  it("getState() returns undefined for unknown slug", () => {
    expect(service.getState("nope")).toBe(undefined);
  });

  // ── start / stop ──────────────────────────────────────────────

  it("start() changes agent phase from idle", async () => {
    service.create(testConfig);
    await service.start("test-agent");
    const state = service.getState("test-agent");
    expect(state).toBeTruthy();
    // After start + tick, phase should have progressed past idle
    expect(state.phase).not.toBe("idle");
  });

  it("stop() sets agent phase to done", async () => {
    service.create(testConfig);
    await service.start("test-agent");
    service.stop("test-agent");
    const state = service.getState("test-agent");
    expect(state).toBeTruthy();
    expect(state.phase).toBe("done");
  });

  it("start() throws for unknown slug", async () => {
    expect(service.start("nope")).rejects.toThrow();
  });

  it("stop() throws for unknown slug", () => {
    expect(
      () => service.stop("nope"),
    ).toThrow();
  });

  // ── subscribe ─────────────────────────────────────────────────

  it("subscribe() fires on create", () => {
    let callCount = 0;
    service.subscribe(() => { callCount++; });
    service.create(testConfig);
    expect(callCount > 0).toBeTruthy();
  });

  it("subscribe() fires on state change (start/stop)", async () => {
    service.create(testConfig);
    let callCount = 0;
    service.subscribe(() => { callCount++; });
    await service.start("test-agent");
    const afterStart = callCount;
    expect(afterStart > 0).toBeTruthy();

    service.stop("test-agent");
    expect(callCount > afterStart).toBeTruthy();
  });

  it("unsubscribe stops notifications", () => {
    let callCount = 0;
    const unsub = service.subscribe(() => { callCount++; });
    service.create(testConfig);
    const afterCreate = callCount;
    unsub();
    service.create({ slug: "another", name: "Another", expertise: [] });
    expect(callCount).toBe(afterCreate);
  });

  // ── steer / followUp ─────────────────────────────────────────

  it("steer() puts message in queue", () => {
    service.create(testConfig);
    service.steer("test-agent", "change direction");
    // Verify by checking the queues have a steer message
    expect(queues.hasSteer("test-agent")).toBeTruthy();
  });

  it("steer() throws for unknown slug", () => {
    expect(
      () => service.steer("nope", "msg"),
    ).toThrow();
  });

  it("followUp() puts message in queue", () => {
    service.create(testConfig);
    service.followUp("test-agent", "next question");
    expect(queues.hasFollowUp("test-agent")).toBeTruthy();
  });

  it("followUp() throws for unknown slug", () => {
    expect(
      () => service.followUp("nope", "msg"),
    ).toThrow();
  });

  // ── templates ─────────────────────────────────────────────────

  it("getTemplateNames() returns available templates", () => {
    const names = service.getTemplateNames();
    expect(names.length > 0).toBeTruthy();
    expect(names.includes("seo-agent")).toBeTruthy();
    expect(names.includes("lead-gen")).toBeTruthy();
    expect(names.includes("research")).toBeTruthy();
  });

  it("getTemplate() returns template config", () => {
    const tmpl = service.getTemplate("seo-agent");
    expect(tmpl).toBeTruthy();
    expect(tmpl.name).toBe("SEO Analyst");
    expect(tmpl.expertise.includes("seo")).toBeTruthy();
  });

  it("getTemplate() returns undefined for unknown name", () => {
    expect(service.getTemplate("nonexistent")).toBe(undefined);
  });
});
