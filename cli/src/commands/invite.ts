/**
 * nex invite — manage workspace invitations.
 *
 * Subcommands: send, list, revoke, resend.
 * Bare `nex invite` launches interactive picker.
 */

import { Command } from "commander";
import { NexClient } from "../lib/client.js";
import {
  getActiveCredentials,
  listWorkspaces,
  switchWorkspace,
  resetDataDirCache,
  loadRegistry,
} from "../lib/workspace-registry.js";
import { style, sym, interactiveSelect, table } from "../lib/tui.js";
import { resolveApiKey, resolveFormat } from "../lib/config.js";

// Types for API responses
interface Invitation {
  id: string;
  email: string;
  status: string;
  role: string;
}

interface InvitationsResponse {
  invitations: Invitation[];
}

interface InvitationResponse {
  invitation: Invitation;
}

function makeClient(): NexClient {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    process.stderr.write("No API key found. Run: nex setup\n");
    process.exit(1);
  }
  return new NexClient(apiKey);
}

function formatRole(role: string): string {
  return role.replace("WORKSPACE_ROLE_", "").toLowerCase();
}

function formatStatus(status: string): string {
  const s = status.replace("INVITATION_STATUS_", "").toLowerCase();
  switch (s) {
    case "pending":
      return style.yellow(s);
    case "accepted":
      return style.green(s);
    case "revoked":
      return style.red(s);
    default:
      return s;
  }
}

const invite = new Command("invite").description(
  "Manage workspace invitations",
);

// --- send ---
invite
  .command("send")
  .description("Send workspace invitations")
  .option("--email <emails...>", "Email addresses to invite")
  .option("--role <role>", "Role: member or admin", "member")
  .action(async (opts: { email?: string[]; role: string }) => {
    let emails = opts.email;
    let role = opts.role;

    if (!emails || emails.length === 0) {
      if (!process.stdin.isTTY) {
        process.stderr.write("No emails provided. Use --email\n");
        process.exit(1);
      }
      // Interactive: prompt for emails
      const input = await promptLine("Email addresses (comma-separated): ");
      if (!input) return;
      emails = input
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);
      if (emails.length === 0) {
        process.stderr.write("No valid emails provided.\n");
        process.exit(1);
      }

      // Role picker
      const selectedRole = await interactiveSelect({
        title: "Select role",
        items: ["member", "admin"] as const,
        render: (item: string) => item,
      });
      if (selectedRole) role = selectedRole;
    }

    const protoRole =
      role === "admin" ? "WORKSPACE_ROLE_ADMIN" : "WORKSPACE_ROLE_MEMBER";
    const invitees = emails.map((email) => ({ email, role: protoRole }));

    const client = makeClient();
    const result = await client.post<InvitationsResponse>("/v1/invitations", {
      invitees,
    });

    const format = resolveFormat();
    if (format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const invitations = result.invitations || [];
      if (invitations.length === 0) {
        console.log(
          `${sym.error} No invitations created (emails may already have pending invites).`,
        );
      } else {
        console.log(
          `${sym.success} Sent ${style.bold(String(invitations.length))} invitation(s):`,
        );
        for (const inv of invitations) {
          console.log(
            `  ${style.dim("\u2022")} ${inv.email} (${formatRole(inv.role)})`,
          );
        }
      }
    }
  });

// --- list ---
invite
  .command("list")
  .description("List workspace invitations")
  .action(async () => {
    const client = makeClient();
    const result = await client.get<InvitationsResponse>("/v1/invitations");

    const format = resolveFormat();
    if (format === "json") {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const invitations = result.invitations || [];
    if (invitations.length === 0) {
      console.log("No invitations found.");
      return;
    }

    const output = table({
      headers: ["Email", "Status", "Role", "ID"],
      rows: invitations.map((inv) => [
        inv.email,
        formatStatus(inv.status),
        formatRole(inv.role),
        style.dim(inv.id),
      ]),
    });

    console.log(`\n  ${style.bold("Workspace Invitations")}\n`);
    console.log(output);
    console.log();
  });

// --- revoke ---
invite
  .command("revoke")
  .description("Revoke a pending invitation")
  .argument("[id]", "Invitation ID to revoke")
  .action(async (id?: string) => {
    const client = makeClient();

    if (!id) {
      if (!process.stdin.isTTY) {
        process.stderr.write("No invitation ID provided.\n");
        process.exit(1);
      }
      // Interactive: fetch pending and let user pick
      const result = await client.get<InvitationsResponse>("/v1/invitations");
      const pending = (result.invitations || []).filter(
        (inv) => inv.status === "INVITATION_STATUS_PENDING",
      );
      if (pending.length === 0) {
        console.log("No pending invitations to revoke.");
        return;
      }
      const selected = await interactiveSelect({
        title: "Select invitation to revoke",
        items: pending,
        render: (inv: Invitation) =>
          `${inv.email} (${formatRole(inv.role)})`,
      });
      if (!selected) return;
      id = selected.id;
    }

    await client.post(`/v1/invitations/${encodeURIComponent(id)}/revoke`);
    console.log(`${sym.success} Invitation ${style.bold(id)} revoked.`);
  });

// --- resend ---
invite
  .command("resend")
  .description("Resend an invitation email")
  .argument("[id]", "Invitation ID to resend")
  .action(async (id?: string) => {
    const client = makeClient();

    if (!id) {
      if (!process.stdin.isTTY) {
        process.stderr.write("No invitation ID provided.\n");
        process.exit(1);
      }
      const result = await client.get<InvitationsResponse>("/v1/invitations");
      const pending = (result.invitations || []).filter(
        (inv) => inv.status === "INVITATION_STATUS_PENDING",
      );
      if (pending.length === 0) {
        console.log("No pending invitations to resend.");
        return;
      }
      const selected = await interactiveSelect({
        title: "Select invitation to resend",
        items: pending,
        render: (inv: Invitation) =>
          `${inv.email} (${formatRole(inv.role)})`,
      });
      if (!selected) return;
      id = selected.id;
    }

    const result = await client.post<InvitationResponse>(
      `/v1/invitations/${encodeURIComponent(id)}/resend`,
    );
    const format = resolveFormat();
    if (format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(
        `${sym.success} Invitation resent to ${style.bold(result.invitation?.email || id)}.`,
      );
    }
  });

// --- bare `nex invite` interactive mode ---
invite.action(async () => {
  if (!process.stdin.isTTY) {
    process.stderr.write(
      "Interactive mode requires a TTY. Use subcommands: send, list, revoke, resend\n",
    );
    process.exit(1);
  }

  // Step 1: Confirm workspace
  const creds = getActiveCredentials();
  if (!creds) {
    process.stderr.write(
      "No active workspace. Run: nex register --email <email>\n",
    );
    process.exit(1);
  }

  const registry = loadRegistry();
  const meta = registry.workspaces[creds.workspace_slug];
  const display = meta?.nickname
    ? `${meta.nickname} (${creds.workspace_slug})`
    : creds.workspace_slug;

  console.log(`\n  ${style.bold("Workspace Invitations")}\n`);
  console.log(`  Current workspace: ${style.bold(display)}\n`);

  const workspaceConfirm = await interactiveSelect({
    title: "Invite to this workspace?",
    items: ["Yes, continue", "Switch workspace"] as const,
    render: (item: string) => item,
  });

  if (!workspaceConfirm) return;

  if (workspaceConfirm === "Switch workspace") {
    const workspaces = listWorkspaces();
    if (workspaces.length <= 1) {
      console.log("No other workspaces available.");
      return;
    }
    const selected = await interactiveSelect({
      title: "Select workspace",
      items: workspaces,
      render: (ws: (typeof workspaces)[number]) => {
        const name = ws.nickname
          ? `${ws.nickname} (${ws.slug})`
          : ws.slug;
        const active =
          ws.slug === registry.active_workspace ? style.green(" \u25CF") : "";
        return `${name}${active}`;
      },
    });
    if (!selected) return;
    switchWorkspace(selected.slug);
    resetDataDirCache();
    console.log(
      `${sym.success} Switched to ${style.bold(selected.nickname || selected.slug)}\n`,
    );
  }

  // Step 2: Action picker
  const actions = [
    { label: "Send invitations", command: "send" },
    { label: "List invitations", command: "list" },
    { label: "Revoke an invitation", command: "revoke" },
    { label: "Resend an invitation", command: "resend" },
  ] as const;

  const action = await interactiveSelect({
    title: "What would you like to do?",
    items: [...actions],
    render: (item: (typeof actions)[number]) => item.label,
  });

  if (!action) return;

  // Execute the selected subcommand
  const sub = invite.commands.find((c) => c.name() === action.command);
  if (sub) {
    await sub.parseAsync([], { from: "user" });
  }
});

export { invite };

// --- Helpers ---

function promptLine(message: string): Promise<string | null> {
  return new Promise((resolve) => {
    process.stdout.write(message);
    process.stdin.setEncoding("utf-8");
    process.stdin.resume();
    process.stdin.once("data", (data: string) => {
      process.stdin.pause();
      resolve(data.trim() || null);
    });
  });
}
