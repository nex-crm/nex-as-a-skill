import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NexApiClient } from "../client.js";

export function registerInviteTools(server: McpServer, client: NexApiClient) {
  server.tool(
    "send_invite",
    "Send workspace invitations by email. Each invitee gets an email with a link to join.",
    {
      invitees: z
        .array(
          z.object({
            email: z.string().email().describe("Email address to invite"),
            role: z
              .enum(["WORKSPACE_ROLE_MEMBER", "WORKSPACE_ROLE_ADMIN"])
              .describe("Role to assign"),
          }),
        )
        .min(1)
        .describe("List of people to invite"),
    },
    { readOnlyHint: false },
    async ({ invitees }) => {
      const result = await client.post("/v1/invitations", { invitees });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    "list_invites",
    "List all pending and accepted workspace invitations.",
    {},
    { readOnlyHint: true },
    async () => {
      const result = await client.get("/v1/invitations");
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    "revoke_invite",
    "Revoke a pending workspace invitation by ID.",
    {
      id: z.string().describe("Invitation ID to revoke"),
    },
    { readOnlyHint: false, destructiveHint: true },
    async ({ id }) => {
      await client.post(
        `/v1/invitations/${encodeURIComponent(id)}/revoke`,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Invitation ${id} revoked`,
            }),
          },
        ],
      };
    },
  );

  server.tool(
    "resend_invite",
    "Resend the invitation email for a pending invitation.",
    {
      id: z.string().describe("Invitation ID to resend"),
    },
    { readOnlyHint: false },
    async ({ id }) => {
      const result = await client.post(
        `/v1/invitations/${encodeURIComponent(id)}/resend`,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
