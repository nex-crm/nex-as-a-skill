import { describe, it, expect } from "bun:test";
import { dispatch, commandNames, commandHelp } from "../../src/commands/dispatch.js";
import type { CommandResult, CommandContext } from "../../src/commands/dispatch.js";

describe("dispatch", () => {
  it("returns error for empty input", async () => {
    const result = await dispatch("");
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeTruthy();
    expect(result.error!).toMatch(/no command/i);
  });

  it("returns error for whitespace-only input", async () => {
    const result = await dispatch("   ");
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeTruthy();
  });

  it("returns error for unknown command", async () => {
    const result = await dispatch("nonexistent");
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeTruthy();
    expect(result.error!).toMatch(/unknown command/i);
  });

  it("returns error for unknown two-word command", async () => {
    const result = await dispatch("record nonexistent");
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeTruthy();
    expect(result.error!).toMatch(/unknown command/i);
  });

  it("returns validation error for ask without query", async () => {
    const result = await dispatch("ask");
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeTruthy();
    expect(result.error!).toMatch(/no query/i);
  });

  it("returns validation error for search without query", async () => {
    const result = await dispatch("search");
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeTruthy();
  });

  it("returns validation error for record get without ID", async () => {
    const result = await dispatch("record get");
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeTruthy();
    expect(result.error!).toMatch(/no record id/i);
  });

  it("returns validation error for record list without slug", async () => {
    const result = await dispatch("record list");
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeTruthy();
    expect(result.error!).toMatch(/no object slug/i);
  });

  it("returns validation error for object get without slug", async () => {
    const result = await dispatch("object get");
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeTruthy();
  });

  it("returns validation error for remember without content", async () => {
    const result = await dispatch("remember");
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeTruthy();
    expect(result.error!).toMatch(/no content/i);
  });

  it("returns validation error for artifact without ID", async () => {
    const result = await dispatch("artifact");
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeTruthy();
  });

  it("returns validation error for record create missing --data", async () => {
    const result = await dispatch("record create person");
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeTruthy();
    expect(result.error!).toMatch(/--data/i);
  });

  it("returns validation error for record create with invalid JSON", async () => {
    const result = await dispatch('record create person --data notjson');
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeTruthy();
    expect(result.error!).toMatch(/invalid json/i);
  });

  it("returns validation error for note create missing --title", async () => {
    const result = await dispatch("note create");
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeTruthy();
    expect(result.error!).toMatch(/--title/i);
  });

  it("returns validation error for task create missing --title", async () => {
    const result = await dispatch("task create");
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeTruthy();
    expect(result.error!).toMatch(/--title/i);
  });

  it("returns validation error for integrate connect without name", async () => {
    const result = await dispatch("integrate connect");
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeTruthy();
  });

  it("returns validation error for integrate connect with unknown name", async () => {
    const result = await dispatch("integrate connect fakething");
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeTruthy();
    expect(result.error!).toMatch(/unknown integration/i);
  });

  it("handles quoted query in ask command", async () => {
    // This tests the parsing path — the command will fail on auth, but that
    // proves parsing worked correctly (it got past the "no query" check)
    const result = await dispatch('ask "who is important?"');
    // Should NOT be the "no query" error — it should be an auth/network error
    if (result.exitCode !== 0) {
      expect(!/no query/i.test(result.error!)).toBeTruthy();
    }
  });

  it("config show works without API key", async () => {
    const result = await dispatch("config show", { format: "json" });
    expect(result.exitCode).toBe(0);
    expect(result.data).toBeTruthy();
    const data = result.data as Record<string, unknown>;
    expect("config_path" in data).toBeTruthy();
    expect("base_url" in data).toBeTruthy();
  });

  it("config path works without API key", async () => {
    const result = await dispatch("config path", { format: "json" });
    expect(result.exitCode).toBe(0);
    expect(result.data).toBeTruthy();
    const data = result.data as Record<string, unknown>;
    expect(typeof data.path === "string").toBeTruthy();
  });
});

describe("commandNames", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(commandNames)).toBeTruthy();
    expect(commandNames.length > 0).toBeTruthy();
  });

  it("is sorted", () => {
    const sorted = [...commandNames].sort();
    expect(commandNames).toEqual(sorted);
  });

  it("includes core commands", () => {
    expect(commandNames.includes("ask")).toBeTruthy();
    expect(commandNames.includes("search")).toBeTruthy();
    expect(commandNames.includes("remember")).toBeTruthy();
    expect(commandNames.includes("recall")).toBeTruthy();
    expect(commandNames.includes("artifact")).toBeTruthy();
    expect(commandNames.includes("capture")).toBeTruthy();
    expect(commandNames.includes("graph")).toBeTruthy();
  });

  it("includes two-word commands", () => {
    expect(commandNames.includes("record list")).toBeTruthy();
    expect(commandNames.includes("record get")).toBeTruthy();
    expect(commandNames.includes("record create")).toBeTruthy();
    expect(commandNames.includes("object list")).toBeTruthy();
    expect(commandNames.includes("object get")).toBeTruthy();
    expect(commandNames.includes("config show")).toBeTruthy();
    expect(commandNames.includes("note create")).toBeTruthy();
    expect(commandNames.includes("task create")).toBeTruthy();
    expect(commandNames.includes("integrate list")).toBeTruthy();
    expect(commandNames.includes("insight list")).toBeTruthy();
  });

  it("has no duplicates", () => {
    const unique = new Set(commandNames);
    expect(commandNames.length).toBe(unique.size);
  });
});

describe("commandHelp", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(commandHelp)).toBeTruthy();
    expect(commandHelp.length > 0).toBeTruthy();
  });

  it("each entry has required fields", () => {
    for (const entry of commandHelp) {
      expect(typeof entry.command === "string" && entry.command.length > 0).toBeTruthy();
      expect(typeof entry.description === "string" && entry.description.length > 0).toBeTruthy();
      expect(typeof entry.category === "string" && entry.category.length > 0).toBeTruthy();
    }
  });

  it("includes all categories", () => {
    const categories = new Set(commandHelp.map((e) => e.category));
    expect(categories.has("query")).toBeTruthy();
    expect(categories.has("write")).toBeTruthy();
    expect(categories.has("config")).toBeTruthy();
    expect(categories.has("ai")).toBeTruthy();
    expect(categories.has("graph")).toBeTruthy();
  });

  it("has same count as commandNames", () => {
    expect(commandHelp.length).toBe(commandNames.length);
  });

  it("every help entry maps to a valid command name", () => {
    const nameSet = new Set(commandNames);
    for (const entry of commandHelp) {
      expect(nameSet.has(entry.command)).toBeTruthy();
    }
  });
});

describe("command aliases", () => {
  it("resolves 'agents' alias to agent list", async () => {
    const result = await dispatch("agents");
    // Should NOT be "unknown command" -- the alias resolves to "agent list"
    expect(!result.error || !/unknown command/i.test(result.error)).toBeTruthy();
    expect(result.exitCode).toBe(0);
  });

  it("resolves 'objects' alias to object list", async () => {
    const result = await dispatch("objects");
    // This hits the network (no API key), so check it resolved past "unknown command"
    if (result.error) {
      expect(!/unknown command/i.test(result.error)).toBeTruthy();
    }
  });

  it("resolves 'orch' alias to orchestration", async () => {
    const result = await dispatch("orch");
    expect(!result.error || !/unknown command/i.test(result.error)).toBeTruthy();
    expect(result.exitCode).toBe(0);
  });

  it("chat command returns hint text", async () => {
    const result = await dispatch("chat");
    expect(result.exitCode).toBe(0);
    expect(result.output.includes("keybinding")).toBeTruthy();
  });

  it("calendar command returns hint text", async () => {
    const result = await dispatch("calendar");
    expect(result.exitCode).toBe(0);
    expect(result.output.includes("keybinding")).toBeTruthy();
  });

  it("orchestration command returns hint text", async () => {
    const result = await dispatch("orchestration");
    expect(result.exitCode).toBe(0);
    expect(result.output.includes("keybinding")).toBeTruthy();
  });
});
