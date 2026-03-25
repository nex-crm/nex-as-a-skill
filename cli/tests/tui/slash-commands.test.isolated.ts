import { describe, it, beforeEach, expect, mock } from "bun:test";

let mockApiKey: string | undefined = "test-api-key-1234567890";
let mockConfigEmail: string | undefined = "user@example.com";

mock.module("../../src/lib/config.js", () => ({
  resolveApiKey: () => mockApiKey,
  loadConfig: () => ({ api_key: mockApiKey, email: mockConfigEmail, workspace_id: "ws-123", workspace_slug: "my-workspace" }),
  saveConfig: () => {}, persistRegistration: () => {},
  CONFIG_PATH: "/tmp/.nex/config.json", BASE_URL: "https://app.nex.ai",
  API_BASE: "https://app.nex.ai/api/developers",
  REGISTER_URL: "https://app.nex.ai/api/v1/agents/register",
  resolveFormat: () => "text", resolveTimeout: () => 120_000,
}));

let mockRegisterResult = { apiKey: "new-key-abc1234567890", workspaceId: "ws-new", workspaceSlug: "new-workspace" };
let mockDetectedPlatforms: Array<{ name: string; slug: string; detected: boolean; nexInstalled: boolean; configPath: string; capabilities: Record<string, boolean> }> = [];
let installForPlatformCalls: Array<{ platform: string; apiKey: string }> = [];

mock.module("../../src/commands/init.js", () => ({
  registerUser: async (_email: string) => mockRegisterResult,
  detectPlatforms: () => mockDetectedPlatforms,
  installForPlatform: (platform: { name: string }, apiKey: string, onProgress: (p: { detail?: string }) => void) => {
    installForPlatformCalls.push({ platform: platform.name, apiKey });
    onProgress({ detail: `Installed for ${platform.name}` });
  },
  getDetected: () => mockDetectedPlatforms, writeMcpConfig: () => {}, runInit: async () => {},
}));

let createdAgents: Array<{ slug: string; config: Record<string, unknown> }> = [];
let createdFromTemplate: Array<{ slug: string; templateName: string }> = [];
const mockAgentService = {
  create(config: Record<string, unknown>) {
    createdAgents.push({ slug: config.slug as string, config });
    return { config: { slug: config.slug as string, name: config.name as string, expertise: config.expertise as string[], heartbeatCron: config.heartbeatCron as string, tools: config.tools as string[], personality: config.personality as string }, state: { phase: "idle" }, loop: {} };
  },
  createFromTemplate(slug: string, templateName: string) {
    createdFromTemplate.push({ slug, templateName });
    const t: Record<string, Record<string, unknown>> = {
      "seo-agent": { name: "SEO Analyst", expertise: ["seo"], heartbeatCron: "daily" },
      "founding-agent": { name: "Founding Agent", expertise: ["general"], heartbeatCron: "daily" },
    };
    const tmpl = t[templateName] ?? { name: templateName, expertise: ["general"], heartbeatCron: "daily" };
    return { config: { slug, ...tmpl }, state: { phase: "idle" }, loop: {} };
  },
  list: () => [], get: () => undefined, subscribe: () => () => {},
};
mock.module("../../src/tui/services/agent-service.js", () => ({
  getAgentService: () => mockAgentService, resetAgentService: () => {}, AgentService: class {},
}));

let syncApiKeyCalls: string[] = [];
mock.module("../../src/lib/installers.js", () => ({
  syncApiKeyToMcpConfig: (key: string) => { syncApiKeyCalls.push(key); },
  installClaudeCodePlugin: () => ({ installed: false, hooksAdded: [], commandsCopied: [] }),
  installMcpServer: () => ({ installed: false, configPath: "" }),
  installRulesFile: () => ({ installed: false, rulesPath: "" }),
  installHooks: () => ({ installed: false, hooksAdded: [] }),
  installOpenCodePlugin: () => ({ installed: false, pluginPath: "" }),
  installOpenClawPlugin: () => ({ installed: false, message: "" }),
  installVSCodeAgent: () => ({ installed: false, agentPath: "" }),
  installKiloCodeMode: () => ({ installed: false, modePath: "" }),
  installWindsurfWorkflows: () => ({ installed: false, workflowCount: 0 }),
  installContinueProvider: () => ({ installed: false, providerPath: "" }),
}));

import { parseSlashInput, getSlashCommand, listSlashCommands, getInitState, resetInitState, handleInitInput } from "../../src/tui/slash-commands.js";
import type { SlashCommandContext, ConversationMessage } from "../../src/tui/slash-commands.js";
import type { SelectOption } from "../../src/tui/components/inline-select.js";

function makeContext(overrides?: Partial<SlashCommandContext>): SlashCommandContext {
  return {
    push: overrides?.push ?? (() => {}),
    dispatch: overrides?.dispatch ?? (async () => ({ output: "", exitCode: 0 })),
    addMessage: overrides?.addMessage ?? (() => {}),
    setLoading: overrides?.setLoading ?? (() => {}),
    showPicker: overrides?.showPicker ?? (() => {}),
    clearPicker: overrides?.clearPicker ?? (() => {}),
    showConfirm: overrides?.showConfirm ?? (() => {}),
    clearConfirm: overrides?.clearConfirm ?? (() => {}),
  };
}

describe("parseSlashInput", () => {
  it("returns isSlash false for plain text", () => { expect(parseSlashInput("hello").isSlash).toBe(false); });
  it("parses /help", () => { const r = parseSlashInput("/help"); expect(r.command).toBe("help"); });
  it("parses /ask with args", () => { const r = parseSlashInput("/ask top leads?"); expect(r.args).toBe("top leads?"); });
});

describe("slash command registry", () => {
  for (const n of ["help","ask","agents","chat","calendar","orchestration","orch","graph","objects","records","remember","clear","init","agent"]) {
    it(`has ${n}`, () => { expect(getSlashCommand(n)).toBeTruthy(); });
  }
  it("returns undefined for unknown", () => { expect(getSlashCommand("x")).toBe(undefined); });
  it("listSlashCommands >= 15", () => { expect(listSlashCommands().length >= 15).toBeTruthy(); });
});

describe("slash command execution", () => {
  it("/help returns output", async () => { const r = await getSlashCommand("help")!.execute("", makeContext()); expect(r.output!.includes("/help")).toBeTruthy(); });
  it("/agents pushes view", async () => { let p: any; await getSlashCommand("agents")!.execute("", makeContext({ push: (v) => { p = v; } })); expect(p.name).toBe("agent-list"); });
  it("/ask no args = usage", async () => { const r = await getSlashCommand("ask")!.execute("", makeContext()); expect(r.output!.includes("Usage")).toBeTruthy(); });
  it("/clear sentinel", async () => { const r = await getSlashCommand("clear")!.execute("", makeContext()); expect(r.output).toBe("__CLEAR__"); });
});

describe("init: picker-based flow", () => {
  beforeEach(() => { resetInitState(); installForPlatformCalls = []; syncApiKeyCalls = []; mockDetectedPlatforms = []; mockApiKey = "test-api-key-1234567890"; mockConfigEmail = "user@example.com"; mockRegisterResult = { apiKey: "new-key-abc1234567890", workspaceId: "ws-new", workspaceSlug: "new-workspace" }; });

  it("/init no key => awaiting_email", async () => {
    mockApiKey = undefined;
    const msgs: ConversationMessage[] = [];
    await getSlashCommand("init")!.execute("", makeContext({ addMessage: (m) => msgs.push(m) }));
    expect(getInitState().phase).toBe("awaiting_email");
  });

  it("/init valid key => showPicker called (not text choices)", async () => {
    mockApiKey = "valid-key-1234567890";
    let picked = false;
    await getSlashCommand("init")!.execute("", makeContext({ dispatch: async () => ({ output: "ok", exitCode: 0 }), showPicker: () => { picked = true; } }));
    expect(picked).toBeTruthy();
  });

  it("/init expired key => picker with regenerate/new-email/skip", async () => {
    mockApiKey = "expired-key-1234567890"; mockConfigEmail = "t@e.com";
    let opts: SelectOption[] = [];
    await getSlashCommand("init")!.execute("", makeContext({ dispatch: async () => ({ output: "", exitCode: 2, error: "API key expired" }), showPicker: (_t, o) => { opts = o; } }));
    expect(opts.length).toBe(3);
    expect(opts.some((o) => o.value === "regenerate")).toBeTruthy();
    expect(opts.some((o) => o.value === "new-email")).toBeTruthy();
    expect(opts.some((o) => o.value === "skip")).toBeTruthy();
  });
});

describe("handleInitInput", () => {
  beforeEach(() => { resetInitState(); installForPlatformCalls = []; syncApiKeyCalls = []; mockDetectedPlatforms = []; mockRegisterResult = { apiKey: "new-key-abc1234567890", workspaceId: "ws-new", workspaceSlug: "new-workspace" }; });

  it("email registers and shows agent picker", async () => {
    mockApiKey = undefined;
    const msgs: ConversationMessage[] = [];
    let picked = false;
    const ctx = makeContext({ addMessage: (m) => msgs.push(m), showPicker: () => { picked = true; } });
    await getSlashCommand("init")!.execute("", ctx);
    await handleInitInput("a@b.com", ctx);
    expect(msgs.some((m) => m.content.includes("Logged in!"))).toBeTruthy();
    expect(picked).toBeTruthy();
  });

  it("invalid email stays in awaiting_email", async () => {
    mockApiKey = undefined;
    const msgs: ConversationMessage[] = [];
    const ctx = makeContext({ addMessage: (m) => msgs.push(m) });
    await getSlashCommand("init")!.execute("", ctx);
    msgs.length = 0;
    await handleInitInput("bad", ctx);
    expect(getInitState().phase).toBe("awaiting_email");
  });

  it("regen picker callbacks work", async () => {
    mockApiKey = "expired-key-1234567890"; mockConfigEmail = "t@e.com";
    const msgs: ConversationMessage[] = [];
    let cb: ((v: string) => void) | undefined;
    const ctx = makeContext({ dispatch: async () => ({ output: "", exitCode: 2, error: "API key expired" }), addMessage: (m) => msgs.push(m), showPicker: (_t, _o, fn) => { cb = fn; } });
    await getSlashCommand("init")!.execute("", ctx);
    msgs.length = 0;
    await cb!("regenerate");
    expect(msgs.some((m) => m.content.includes("New key generated"))).toBeTruthy();
  });
});

describe("agent onboarding (picker)", () => {
  beforeEach(() => { resetInitState(); createdAgents = []; createdFromTemplate = []; installForPlatformCalls = []; syncApiKeyCalls = []; mockDetectedPlatforms = []; mockApiKey = "valid-key-1234567890"; });

  async function toAgentPicker(ctx: SlashCommandContext) {
    let cb: ((v: string) => void) | undefined;
    let opts: SelectOption[] = [];
    const orig = ctx.showPicker;
    ctx.showPicker = (t, o, fn) => { cb = fn; opts = o; orig(t, o, fn); };
    await getSlashCommand("init")!.execute("", ctx);
    expect(cb).toBeTruthy();
    return { onSelect: cb!, options: opts };
  }

  it("picker has 4 options", async () => {
    const ctx = makeContext({ dispatch: async () => ({ output: "ok", exitCode: 0 }) });
    const { options } = await toAgentPicker(ctx);
    expect(options.some((o) => o.value === "templates")).toBeTruthy();
    expect(options.some((o) => o.value === "custom")).toBeTruthy();
    expect(options.some((o) => o.value === "founding")).toBeTruthy();
    expect(options.some((o) => o.value === "skip")).toBeTruthy();
  });

  it("founding creates agent", async () => {
    const msgs: ConversationMessage[] = [];
    const ctx = makeContext({ dispatch: async () => ({ output: "ok", exitCode: 0 }), addMessage: (m) => msgs.push(m) });
    const { onSelect } = await toAgentPicker(ctx);
    await onSelect("founding");
    expect(createdFromTemplate.some((c) => c.slug === "founding-agent")).toBeTruthy();
    expect(msgs.some((m) => m.content.includes('Created "Founding Agent"'))).toBeTruthy();
  });

  it("skip skips", async () => {
    const msgs: ConversationMessage[] = [];
    const ctx = makeContext({ dispatch: async () => ({ output: "ok", exitCode: 0 }), addMessage: (m) => msgs.push(m) });
    const { onSelect } = await toAgentPicker(ctx);
    onSelect("skip");
    expect(msgs.some((m) => m.content.includes("Skipped"))).toBeTruthy();
  });

  it("custom => prompt => confirm => create", async () => {
    const msgs: ConversationMessage[] = [];
    let confirmCb: ((ok: boolean) => void) | undefined;
    const ctx = makeContext({ dispatch: async () => ({ output: "not json", exitCode: 0 }), addMessage: (m) => msgs.push(m), showConfirm: (_q, cb) => { confirmCb = cb; } });
    const { onSelect } = await toAgentPicker(ctx);
    onSelect("custom");
    expect(getInitState().phase).toBe("awaiting_agent_prompt");
    await handleInitInput("Track sales", ctx);
    expect(confirmCb).toBeTruthy();
    msgs.length = 0;
    await confirmCb!(true);
    expect(createdAgents.length).toBe(1);
  });

  it("templates => template picker => create", async () => {
    let tCb: ((v: string) => void) | undefined;
    const msgs: ConversationMessage[] = [];
    const ctx = makeContext({ dispatch: async () => ({ output: "ok", exitCode: 0 }), addMessage: (m) => msgs.push(m), showPicker: (_t, opts, cb) => { if (opts.some((o) => o.value === "seo-agent")) tCb = cb; } });
    const { onSelect } = await toAgentPicker(ctx);
    onSelect("templates");
    expect(tCb).toBeTruthy();
    msgs.length = 0;
    tCb!("seo-agent");
    // handleTemplateSelect is async — wait for microtask queue
    await new Promise((r) => setTimeout(r, 10));
    expect(createdFromTemplate.some((c) => c.slug === "seo-agent")).toBeTruthy();
    expect(msgs.some((m) => m.content.includes('Created "SEO Analyst"'))).toBeTruthy();
  });
});
