import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NexApiClient } from "../client.js";

export function registerActionTools(server: McpServer, client: NexApiClient) {
  server.tool(
    "execute_action",
    "Execute an approved action. Routes to either internal CRM mutation or external execution via One CLI/Composio. Requires a prior approval unless the policy mode is trusted_write. Every execution is logged to the action history with full audit trail.",
    {
      action_type: z.enum(["internal", "external"]).describe("internal = CRM CRUD, external = One CLI / Composio"),
      operation: z.string().describe("Operation to perform (e.g. 'create_task', 'update_deal_stage', 'send_email', 'post_slack')"),
      target_entity_id: z.string().optional().describe("Target entity ID for internal actions"),
      approval_id: z.string().optional().describe("Approval ID if this action was approved via the approval queue"),
      params: z.record(z.unknown()).optional().describe("Action-specific parameters (JSON object)"),
    },
    { readOnlyHint: false },
    async ({ action_type, operation, target_entity_id, approval_id, params }) => {
      const body: Record<string, unknown> = { action_type, operation };
      if (target_entity_id !== undefined) body.target_entity_id = target_entity_id;
      if (approval_id !== undefined) body.approval_id = approval_id;
      if (params !== undefined) body.params = params;
      const result = await client.post("/v1/crm/actions/execute", body);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}
