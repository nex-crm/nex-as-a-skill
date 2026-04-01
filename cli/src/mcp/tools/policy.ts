import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NexApiClient } from "../client.js";

export function registerPolicyTools(server: McpServer, client: NexApiClient) {
  server.tool(
    "get_policy",
    "Get the current agent policy configuration. Shows trust levels per object type and action type (observe_only, draft_only, approve_before_write, trusted_write).",
    {},
    { readOnlyHint: true },
    async () => {
      const result = await client.get("/v1/policy");
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "update_policy",
    "Update the agent policy configuration. Sets trust levels per object type and action type. WARNING: This is a sensitive operation that controls what agents can do autonomously. In production, this should be human-only.",
    {
      object_type: z.string().describe("Object type to set policy for (e.g. 'deal', 'contact', 'task')"),
      action_type: z.string().optional().describe("Specific action type (e.g. 'create', 'update', 'delete'). If omitted, applies to all actions on this object type."),
      trust_level: z.enum(["observe_only", "draft_only", "approve_before_write", "trusted_write"]).describe("Trust level for this object+action combination"),
    },
    { readOnlyHint: false, destructiveHint: true },
    async ({ object_type, action_type, trust_level }) => {
      const body: Record<string, unknown> = { object_type, trust_level };
      if (action_type !== undefined) body.action_type = action_type;
      const result = await client.put("/v1/policy", body);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}
