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

// --- Interactive picker ---

async function interactiveWorkspacePicker(): Promise<void> {
  const registry = loadRegistry();
  let workspaces = listWorkspaces();

  if (workspaces.length === 0) {
    console.log("No workspaces registered. Run: nex register --email <email>");
    return;
  }

  let selected = 0;
  let mode: "normal" | "renaming" | "confirming-delete" = "normal";
  let renameBuffer = "";
  let errorMessage = "";

  function draw() {
    // Clear screen + move cursor home
    process.stdout.write("\x1b[2J\x1b[H");

    process.stdout.write(`  ${style.bold("Workspaces")}${style.dim("  (q to exit)")}\n`);
    process.stdout.write(`  ${"─".repeat(45)}\n\n`);

    for (let i = 0; i < workspaces.length; i++) {
      const ws = workspaces[i];
      const isActive = ws.slug === registry.active_workspace;
      const isSelected = i === selected;
      const indicator = isActive ? style.green("●") : " ";
      const pointer = isSelected ? style.cyan(sym.pointer) : " ";

      const display = ws.nickname
        ? `${style.bold(ws.nickname)} ${style.dim(`(${ws.slug})`)}`
        : style.bold(ws.slug);

      process.stdout.write(`  ${pointer} ${indicator} ${display}\n`);
      process.stdout.write(`      ${style.dim(ws.email)}\n`);

      // Inline rename input
      if (isSelected && mode === "renaming") {
        process.stdout.write(`      ${style.cyan("Nickname:")} ${renameBuffer}\u2588\n`);
      }

      // Inline delete confirmation
      if (isSelected && mode === "confirming-delete") {
        const name = ws.nickname || ws.slug;
        process.stdout.write(`      ${style.red(`Remove ${name}? (y/n)`)}\n`);
      }

      process.stdout.write("\n");
    }

    if (errorMessage) {
      process.stdout.write(`  ${style.red(errorMessage)}\n\n`);
      errorMessage = "";
    }

    if (mode === "normal") {
      process.stdout.write(
        `  ${style.dim("[↑↓] navigate  [enter] switch  [r] rename  [d] delete")}\n`
      );
    } else if (mode === "renaming") {
      process.stdout.write(`  ${style.dim("[enter] save  [esc] cancel")}\n`);
    }
  }

  function cleanup() {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdin.removeAllListeners("data");
    // Clear screen
    process.stdout.write("\x1b[2J\x1b[H");
  }

  return new Promise<void>((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf-8");

    draw();

    process.stdin.on("data", (key: string) => {
      if (mode === "normal") {
        // Navigation
        if (key === "\x1b[A" && selected > 0) {
          selected--;
        } else if (key === "\x1b[B" && selected < workspaces.length - 1) {
          selected++;
        }

        // Switch (enter)
        else if (key === "\r") {
          const ws = workspaces[selected];
          if (ws.slug !== registry.active_workspace) {
            switchWorkspace(ws.slug);
            resetDataDirCache();
            registry.active_workspace = ws.slug;
          }
          cleanup();
          const display = ws.nickname || ws.slug;
          console.log(`${sym.success} Switched to ${style.bold(display)}`);
          resolve();
          return;
        }

        // Rename (r)
        else if (key === "r") {
          mode = "renaming";
          renameBuffer = workspaces[selected].nickname || "";
        }

        // Delete (d)
        else if (key === "d") {
          const ws = workspaces[selected];
          if (ws.slug === registry.active_workspace) {
            errorMessage = "Cannot remove active workspace. Switch first.";
          } else {
            mode = "confirming-delete";
          }
        }

        // Quit
        else if (key === "q" || key === "\x03") {
          cleanup();
          resolve();
          return;
        }
      }

      else if (mode === "renaming") {
        if (key === "\r") {
          // Commit rename
          const ws = workspaces[selected];
          renameWorkspace(ws.slug, renameBuffer);
          ws.nickname = renameBuffer;
          mode = "normal";
          renameBuffer = "";
        } else if (key === "\x1b") {
          // Cancel
          mode = "normal";
          renameBuffer = "";
        } else if (key === "\x7f") {
          // Backspace
          renameBuffer = renameBuffer.slice(0, -1);
        } else if (key.length === 1 && key >= " ") {
          renameBuffer += key;
        }
      }

      else if (mode === "confirming-delete") {
        if (key === "y") {
          const ws = workspaces[selected];
          removeWorkspace(ws.slug);
          workspaces = listWorkspaces();
          if (selected >= workspaces.length) selected = Math.max(0, workspaces.length - 1);
          mode = "normal";

          if (workspaces.length === 0) {
            cleanup();
            console.log("All workspaces removed.");
            resolve();
            return;
          }
        } else {
          mode = "normal";
        }
      }

      draw();
    });
  });
}
