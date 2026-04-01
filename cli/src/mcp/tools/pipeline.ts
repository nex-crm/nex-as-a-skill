import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NexApiClient } from "../client.js";

export function registerPipelineTools(server: McpServer, client: NexApiClient) {
  server.tool(
    "get_pipeline",
    "Get the deal pipeline. Returns deals grouped by stage with probabilities, projected values, and days-in-stage. Filterable by time window and owner.",
    {
      owner_id: z.string().optional().describe("Filter by deal owner"),
      closing_before: z.string().optional().describe("Only deals with close_date before this date (RFC3339)"),
      closing_after: z.string().optional().describe("Only deals with close_date after this date (RFC3339)"),
    },
    { readOnlyHint: true },
    async ({ owner_id, closing_before, closing_after }) => {
      const params = new URLSearchParams();
      if (owner_id) params.set("owner_id", owner_id);
      if (closing_before) params.set("closing_before", closing_before);
      if (closing_after) params.set("closing_after", closing_after);
      const qs = params.toString();
      const path = `/v1/crm/pipeline${qs ? `?${qs}` : ""}`;
      const result = await client.get(path);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "move_deal_stage",
    "Move a deal to a new pipeline stage. Validates against stage transition guards (e.g. 'can't close without contract signed'). Logs the stage change with timestamp and actor.",
    {
      deal_id: z.string().describe("Deal record ID"),
      new_stage: z.string().describe("Target stage name"),
      reason: z.string().optional().describe("Reason for the stage change"),
    },
    { readOnlyHint: false },
    async ({ deal_id, new_stage, reason }) => {
      const body: Record<string, unknown> = { deal_id, new_stage };
      if (reason !== undefined) body.reason = reason;
      const result = await client.post("/v1/crm/pipeline/move", body);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "get_forecast",
    "Get the revenue forecast. Shows projected revenue by stage, weighted pipeline value, and comparison to prior periods. Use for pipeline reviews and planning.",
    {
      period: z.enum(["week", "month", "quarter"]).optional().describe("Forecast period (default: month)"),
    },
    { readOnlyHint: true },
    async ({ period }) => {
      const params = new URLSearchParams();
      if (period) params.set("period", period);
      const qs = params.toString();
      const path = `/v1/crm/pipeline/forecast${qs ? `?${qs}` : ""}`;
      const result = await client.get(path);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}
