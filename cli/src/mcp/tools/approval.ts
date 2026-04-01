import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NexApiClient } from "../client.js";

export function registerApprovalTools(server: McpServer, client: NexApiClient) {
  server.tool(
    "list_proposed_actions",
    "List pending approval proposals. Shows actions the AI agent wants to take that require human review. Each proposal includes the action type, target entity, risk level, and reasoning.",
    {
      entity_id: z.string().optional().describe("Filter by target entity ID"),
      status: z.enum(["pending", "approved", "rejected", "expired"]).optional().describe("Filter by status (default: pending)"),
      limit: z.number().optional().describe("Max results (default: 20)"),
    },
    { readOnlyHint: true },
    async ({ entity_id, status, limit }) => {
      const params = new URLSearchParams();
      if (entity_id) params.set("entity_id", entity_id);
      if (status) params.set("status", status);
      if (limit !== undefined) params.set("limit", String(limit));
      const qs = params.toString();
      const path = `/v1/crm/approvals${qs ? `?${qs}` : ""}`;
      const result = await client.get(path);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "approve_action",
    "Approve a proposed action. The system will execute the action and log the result to the audit trail. Verifies the target record hasn't changed since the proposal was created (version check).",
    {
      proposal_id: z.string().describe("Proposal ID to approve"),
      comment: z.string().optional().describe("Optional approval comment"),
    },
    { readOnlyHint: false },
    async ({ proposal_id, comment }) => {
      const body: Record<string, unknown> = { action: "approve" };
      if (comment !== undefined) body.comment = comment;
      const result = await client.patch(`/v1/crm/approvals/${encodeURIComponent(proposal_id)}`, body);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "reject_action",
    "Reject a proposed action. The action will not be executed. Optionally provide a reason for rejection.",
    {
      proposal_id: z.string().describe("Proposal ID to reject"),
      reason: z.string().optional().describe("Reason for rejection"),
    },
    { readOnlyHint: false },
    async ({ proposal_id, reason }) => {
      const body: Record<string, unknown> = { action: "reject" };
      if (reason !== undefined) body.reason = reason;
      const result = await client.patch(`/v1/crm/approvals/${encodeURIComponent(proposal_id)}`, body);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "get_action_history",
    "Get the audit trail of all agent actions for an entity or workspace. Shows what was proposed, who approved it, what was executed, and the outcome.",
    {
      entity_id: z.string().optional().describe("Filter by entity ID"),
      limit: z.number().optional().describe("Max results (default: 50)"),
      since: z.string().optional().describe("Duration like '7d', '24h'"),
    },
    { readOnlyHint: true },
    async ({ entity_id, limit, since }) => {
      const params = new URLSearchParams();
      if (entity_id) params.set("entity_id", entity_id);
      if (limit !== undefined) params.set("limit", String(limit));
      if (since) params.set("since", since);
      const qs = params.toString();
      const path = `/v1/crm/actions/history${qs ? `?${qs}` : ""}`;
      const result = await client.get(path);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}
