import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

// We'll test against a temp directory to avoid touching real ~/.nex/
const TEST_DIR = join(import.meta.dir, "../../.test-nex");

// The registry module will accept a base dir for testing
import {
  loadRegistry,
  saveRegistry,
  addWorkspace,
  removeWorkspace,
  switchWorkspace,
  renameWorkspace,
  getActiveCredentials,
  listWorkspaces,
  migrateIfNeeded,
  workspaceDataDir,
  resolveSlug,
  type WorkspaceRegistry,
  type WorkspaceCredentials,
} from "../../src/lib/workspace-registry.js";

function writeJson(path: string, data: unknown) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("migrateIfNeeded", () => {
  test("migrates flat config.json to workspace structure", () => {
    const configPath = join(TEST_DIR, "config.json");
    writeJson(configPath, {
      api_key: "sk-test-123",
      email: "test@example.com",
      workspace_id: "12345",
      workspace_slug: "test_workspace",
      default_format: "text",
    });

    // Create some state files
    writeFileSync(join(TEST_DIR, "file-scan-manifest.json"), "{}");
    writeFileSync(join(TEST_DIR, "recall-state.json"), "{}");

    migrateIfNeeded(TEST_DIR);

    // config.json should now have active_workspace
    const config = readJson(configPath);
    expect(config.active_workspace).toBe("test_workspace");
    expect(config.workspaces.test_workspace).toBeDefined();
    expect(config.api_key).toBeUndefined();
    expect(config.default_format).toBe("text");

    // credentials.json should exist
    const creds = readJson(join(TEST_DIR, "workspaces", "test_workspace", "credentials.json"));
    expect(creds.api_key).toBe("sk-test-123");
    expect(creds.email).toBe("test@example.com");

    // State files should have moved
    expect(existsSync(join(TEST_DIR, "workspaces", "test_workspace", "file-scan-manifest.json"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "file-scan-manifest.json"))).toBe(false);
  });

  test("skips if already migrated", () => {
    const configPath = join(TEST_DIR, "config.json");
    writeJson(configPath, {
      active_workspace: "existing",
      workspaces: { existing: { added_at: 1000 } },
    });

    migrateIfNeeded(TEST_DIR);

    const config = readJson(configPath);
    expect(config.active_workspace).toBe("existing");
  });

  test("migrates ~/.nex-mcp.json as second workspace", () => {
    const configPath = join(TEST_DIR, "config.json");
    writeJson(configPath, {
      api_key: "sk-cli-key",
      email: "user@cli.com",
      workspace_id: "111",
      workspace_slug: "cli_workspace",
    });

    const mcpPath = join(TEST_DIR, "mcp-config.json"); // test stand-in for ~/.nex-mcp.json
    writeJson(mcpPath, {
      api_key: "sk-mcp-key",
      email: "user@mcp.com",
      workspace_id: "222",
      workspace_slug: "mcp_workspace",
    });

    migrateIfNeeded(TEST_DIR, mcpPath);

    const config = readJson(configPath);
    expect(config.active_workspace).toBe("cli_workspace");
    expect(config.workspaces.cli_workspace).toBeDefined();
    expect(config.workspaces.mcp_workspace).toBeDefined();

    // Both should have credentials
    const cliCreds = readJson(join(TEST_DIR, "workspaces", "cli_workspace", "credentials.json"));
    expect(cliCreds.api_key).toBe("sk-cli-key");

    const mcpCreds = readJson(join(TEST_DIR, "workspaces", "mcp_workspace", "credentials.json"));
    expect(mcpCreds.api_key).toBe("sk-mcp-key");
  });
});

describe("loadRegistry", () => {
  test("returns empty registry for missing config", () => {
    const reg = loadRegistry(TEST_DIR);
    expect(reg.active_workspace).toBe("");
    expect(Object.keys(reg.workspaces)).toHaveLength(0);
  });

  test("loads existing registry", () => {
    writeJson(join(TEST_DIR, "config.json"), {
      active_workspace: "ws1",
      workspaces: { ws1: { nickname: "My WS", added_at: 1000 } },
    });

    const reg = loadRegistry(TEST_DIR);
    expect(reg.active_workspace).toBe("ws1");
    expect(reg.workspaces.ws1.nickname).toBe("My WS");
  });
});

describe("addWorkspace", () => {
  test("creates workspace dir and updates registry", () => {
    const creds: WorkspaceCredentials = {
      api_key: "sk-new",
      email: "new@test.com",
      workspace_id: "999",
      workspace_slug: "new_ws",
    };

    addWorkspace("new_ws", creds, "My New WS", TEST_DIR);

    const reg = loadRegistry(TEST_DIR);
    expect(reg.active_workspace).toBe("new_ws");
    expect(reg.workspaces.new_ws.nickname).toBe("My New WS");

    const saved = readJson(join(TEST_DIR, "workspaces", "new_ws", "credentials.json"));
    expect(saved.api_key).toBe("sk-new");
  });

  test("updates credentials for existing workspace", () => {
    const creds1: WorkspaceCredentials = {
      api_key: "sk-old",
      email: "test@test.com",
      workspace_id: "1",
      workspace_slug: "ws",
    };
    addWorkspace("ws", creds1, "Original", TEST_DIR);

    const creds2: WorkspaceCredentials = {
      api_key: "sk-new",
      email: "test@test.com",
      workspace_id: "1",
      workspace_slug: "ws",
    };
    addWorkspace("ws", creds2, undefined, TEST_DIR);

    const saved = readJson(join(TEST_DIR, "workspaces", "ws", "credentials.json"));
    expect(saved.api_key).toBe("sk-new");

    // Nickname should be preserved
    const reg = loadRegistry(TEST_DIR);
    expect(reg.workspaces.ws.nickname).toBe("Original");
  });
});

describe("switchWorkspace", () => {
  test("switches active workspace", () => {
    const creds1: WorkspaceCredentials = {
      api_key: "sk-1", email: "a@test.com", workspace_id: "1", workspace_slug: "ws1",
    };
    const creds2: WorkspaceCredentials = {
      api_key: "sk-2", email: "b@test.com", workspace_id: "2", workspace_slug: "ws2",
    };
    addWorkspace("ws1", creds1, undefined, TEST_DIR);
    addWorkspace("ws2", creds2, undefined, TEST_DIR);

    switchWorkspace("ws2", TEST_DIR);
    const reg = loadRegistry(TEST_DIR);
    expect(reg.active_workspace).toBe("ws2");
  });

  test("throws for unknown slug", () => {
    expect(() => switchWorkspace("nonexistent", TEST_DIR)).toThrow();
  });
});

describe("removeWorkspace", () => {
  test("removes workspace dir and registry entry", () => {
    const creds: WorkspaceCredentials = {
      api_key: "sk-1", email: "a@test.com", workspace_id: "1", workspace_slug: "ws1",
    };
    addWorkspace("ws1", creds, undefined, TEST_DIR);
    removeWorkspace("ws1", TEST_DIR);

    const reg = loadRegistry(TEST_DIR);
    expect(reg.workspaces.ws1).toBeUndefined();
    expect(existsSync(join(TEST_DIR, "workspaces", "ws1"))).toBe(false);
  });
});

describe("renameWorkspace", () => {
  test("updates nickname", () => {
    const creds: WorkspaceCredentials = {
      api_key: "sk-1", email: "a@test.com", workspace_id: "1", workspace_slug: "ws1",
    };
    addWorkspace("ws1", creds, "Old Name", TEST_DIR);
    renameWorkspace("ws1", "New Name", TEST_DIR);

    const reg = loadRegistry(TEST_DIR);
    expect(reg.workspaces.ws1.nickname).toBe("New Name");
  });
});

describe("getActiveCredentials", () => {
  test("returns credentials for active workspace", () => {
    const creds: WorkspaceCredentials = {
      api_key: "sk-active", email: "a@test.com", workspace_id: "1", workspace_slug: "ws1",
    };
    addWorkspace("ws1", creds, undefined, TEST_DIR);

    const active = getActiveCredentials(TEST_DIR);
    expect(active?.api_key).toBe("sk-active");
  });

  test("returns undefined when no workspaces", () => {
    const active = getActiveCredentials(TEST_DIR);
    expect(active).toBeUndefined();
  });
});

describe("listWorkspaces", () => {
  test("returns workspaces sorted by added_at", () => {
    const creds1: WorkspaceCredentials = {
      api_key: "sk-1", email: "a@test.com", workspace_id: "1", workspace_slug: "ws1",
    };
    const creds2: WorkspaceCredentials = {
      api_key: "sk-2", email: "b@test.com", workspace_id: "2", workspace_slug: "ws2",
    };
    addWorkspace("ws1", creds1, "First", TEST_DIR);
    addWorkspace("ws2", creds2, "Second", TEST_DIR);

    const list = listWorkspaces(TEST_DIR);
    expect(list).toHaveLength(2);
    expect(list[0].slug).toBe("ws1");
    expect(list[1].slug).toBe("ws2");
  });
});

describe("resolveSlug", () => {
  test("resolves exact slug", () => {
    const creds: WorkspaceCredentials = {
      api_key: "sk-1", email: "a@test.com", workspace_id: "1", workspace_slug: "ws1",
    };
    addWorkspace("ws1", creds, "My WS", TEST_DIR);
    expect(resolveSlug("ws1", TEST_DIR)).toBe("ws1");
  });

  test("resolves case-insensitive nickname", () => {
    const creds: WorkspaceCredentials = {
      api_key: "sk-1", email: "a@test.com", workspace_id: "1", workspace_slug: "ws1",
    };
    addWorkspace("ws1", creds, "Personal", TEST_DIR);
    expect(resolveSlug("personal", TEST_DIR)).toBe("ws1");
    expect(resolveSlug("PERSONAL", TEST_DIR)).toBe("ws1");
  });

  test("returns null for no match", () => {
    expect(resolveSlug("nonexistent", TEST_DIR)).toBeNull();
  });
});

describe("workspaceDataDir", () => {
  test("returns path for active workspace", () => {
    const creds: WorkspaceCredentials = {
      api_key: "sk-1", email: "a@test.com", workspace_id: "1", workspace_slug: "ws1",
    };
    addWorkspace("ws1", creds, undefined, TEST_DIR);

    const dir = workspaceDataDir(undefined, TEST_DIR);
    expect(dir).toBe(join(TEST_DIR, "workspaces", "ws1"));
  });

  test("returns path for explicit slug", () => {
    const dir = workspaceDataDir("custom", TEST_DIR);
    expect(dir).toBe(join(TEST_DIR, "workspaces", "custom"));
  });
});

describe("config integration", () => {
  test("resolveApiKey returns active workspace key when no env/flag", () => {
    const creds: WorkspaceCredentials = {
      api_key: "sk-from-workspace", email: "a@test.com", workspace_id: "1", workspace_slug: "ws1",
    };
    addWorkspace("ws1", creds, undefined, TEST_DIR);

    // This tests the registry path; actual config.ts integration is manual
    const active = getActiveCredentials(TEST_DIR);
    expect(active?.api_key).toBe("sk-from-workspace");
  });
});
