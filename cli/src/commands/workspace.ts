/**
 * nex workspace — manage local workspaces.
 *
 * Subcommands: list, switch, rename, current.
 */

import { Command } from "commander";
import {
  listWorkspaces,
  switchWorkspace,
  renameWorkspace,
  getActiveCredentials,
  resolveSlug,
  loadRegistry,
  resetDataDirCache,
  removeWorkspace,
} from "../lib/workspace-registry.js";
import { style, sym } from "../lib/tui.js";
import { resolveFormat } from "../lib/config.js";

const workspace = new Command("workspace").description("Manage workspaces");

// --- current ---

workspace
  .command("current")
  .description("Show active workspace")
  .action(() => {
    const creds = getActiveCredentials();
    if (!creds) {
      process.stderr.write("No active workspace. Run: nex register --email <email>\n");
      process.exit(1);
    }

    const registry = loadRegistry();
    const meta = registry.workspaces[creds.workspace_slug];
    const nickname = meta?.nickname;

    const format = resolveFormat();
    if (format === "json") {
      console.log(JSON.stringify({
        slug: creds.workspace_slug,
        nickname: nickname || null,
        email: creds.email,
        workspace_id: creds.workspace_id,
        active: true,
      }));
    } else {
      const display = nickname
        ? `${style.bold(nickname)} (${style.dim(creds.workspace_slug)})`
        : style.bold(creds.workspace_slug);
      console.log(`${sym.success} Active: ${display}`);
      console.log(`  Email: ${creds.email}`);
      console.log(`  ID:    ${creds.workspace_id}`);
    }
  });

// --- switch ---

workspace
  .command("switch")
  .description("Switch active workspace")
  .argument("[slug-or-nickname]", "Workspace slug or nickname")
  .action(async (input?: string) => {
    if (!input) {
      // Interactive mode — launch picker
      await interactiveWorkspacePicker();
      return;
    }

    const slug = resolveSlug(input);
    if (!slug) {
      process.stderr.write(`Workspace "${input}" not found.\n`);
      process.exit(1);
    }

    const creds = switchWorkspace(slug);
    resetDataDirCache();
    console.log(`${sym.success} Switched to ${style.bold(slug)} (${creds.email})`);
  });

// --- rename ---

workspace
  .command("rename")
  .description("Rename a workspace")
  .argument("<slug-or-nickname>", "Workspace slug or nickname")
  .argument("<name>", "New nickname")
  .action((input: string, name: string) => {
    const slug = resolveSlug(input);
    if (!slug) {
      process.stderr.write(`Workspace "${input}" not found.\n`);
      process.exit(1);
    }

    renameWorkspace(slug, name);
    console.log(`${sym.success} Renamed ${style.bold(slug)} to "${name}"`);
  });

// --- list ---

workspace
  .command("list")
  .description("Interactive workspace manager")
  .action(async () => {
    if (!process.stdin.isTTY) {
      // Non-TTY: print JSON list
      const workspaces = listWorkspaces();
      const registry = loadRegistry();
      const output = workspaces.map((ws) => ({
        slug: ws.slug,
        nickname: ws.nickname || null,
        email: ws.email,
        active: ws.slug === registry.active_workspace,
      }));
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    await interactiveWorkspacePicker();
  });

export { workspace };

// --- Interactive picker (placeholder — implemented in Task 4) ---

async function interactiveWorkspacePicker(): Promise<void> {
  // TODO: Task 4 implements the full interactive picker
  const workspaces = listWorkspaces();
  const registry = loadRegistry();

  if (workspaces.length === 0) {
    console.log("No workspaces registered. Run: nex register --email <email>");
    return;
  }

  for (const ws of workspaces) {
    const active = ws.slug === registry.active_workspace ? `${style.green("●")} ` : "  ";
    const display = ws.nickname
      ? `${style.bold(ws.nickname)} (${style.dim(ws.slug)})`
      : style.bold(ws.slug);
    console.log(`${active}${display}`);
    console.log(`  ${style.dim(ws.email)}`);
  }
}
