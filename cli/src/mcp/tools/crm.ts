import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NexApiClient } from "../client.js";

export function registerCrmTools(server: McpServer, client: NexApiClient) {
  server.tool(
    "get_account_brief",
    "Get a structured account brief for a company. Combines entity brief, open deals, pending tasks, recent interactions, and relationship signals into a single view. This is the primary tool for understanding an account's current state.",
    { entity_id: z.string().describe("Account/company record ID or context entity ID") },
    { readOnlyHint: true },
    async ({ entity_id }) => {
      const result = await client.get(`/v1/crm/account/${encodeURIComponent(entity_id)}/brief`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "get_deal_brief",
    "Get a structured deal brief. Includes deal stage, value, close date, key contacts, recent activity, next steps, and risk assessment.",
    { deal_id: z.string().describe("Deal record ID") },
    { readOnlyHint: true },
    async ({ deal_id }) => {
      const result = await client.get(`/v1/crm/deal/${encodeURIComponent(deal_id)}/brief`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "recommend_next_actions",
    "Get AI-recommended next actions for an entity (account, contact, or deal). Uses workspace playbooks and interaction history to suggest follow-ups, tasks, and outreach. Returns ranked actions with confidence scores and reasoning.",
    {
      entity_id: z.string().describe("Entity ID to get recommendations for"),
      limit: z.number().optional().describe("Max recommendations (default: 5)"),
    },
    { readOnlyHint: true },
    async ({ entity_id, limit }) => {
      const body: Record<string, unknown> = { entity_id: parseInt(entity_id, 10) };
      if (limit !== undefined) body.limit = limit;
      const result = await client.post("/v1/crm/recommend", body);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "what_did_i_miss",
    "Get a structured catch-up digest of all relationship activity over a time window. Summarizes deal movements, new interactions, stale deals, completed tasks, and key changes. Perfect after PTO or a busy week.",
    {
      since: z.string().optional().describe("Duration like '7d', '24h', '30d' (default: '7d')"),
      from: z.string().optional().describe("Start date in RFC3339 format (alternative to 'since')"),
      to: z.string().optional().describe("End date in RFC3339 format (default: now)"),
    },
    { readOnlyHint: true },
    async ({ since, from, to }) => {
      const params = new URLSearchParams();
      if (since) params.set("since", since);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      const path = `/v1/crm/catchup${qs ? `?${qs}` : ""}`;
      const result = await client.get(path);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "get_warmth_score",
    "Get the relationship warmth score for a contact or account. Based on interaction frequency, recency, and sentiment. Returns a 0-100 score with breakdown and trend (warming/cooling/stable).",
    { entity_id: z.string().describe("Contact or account entity ID") },
    { readOnlyHint: true },
    async ({ entity_id }) => {
      const result = await client.get(`/v1/crm/warmth/${encodeURIComponent(entity_id)}`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}
