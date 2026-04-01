import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NexApiClient } from "../client.js";

export function registerPlaybookTools(server: McpServer, client: NexApiClient) {
  server.tool(
    "list_briefs",
    "List entity briefs (auto-generated intelligence documents per person/company). Returns metadata only.",
    {},
    { readOnlyHint: true },
    async () => {
      const result = await client.get("/v1/playbooks");
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "get_brief",
    "Get a full entity brief or workspace playbook by ID, including markdown content with citations.",
    { playbook_id: z.string().describe("Brief or playbook ID") },
    { readOnlyHint: true },
    async ({ playbook_id }) => {
      const result = await client.get(`/v1/playbooks/${encodeURIComponent(playbook_id)}`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "get_entity_brief",
    "Get the entity brief for a specific person or company by their context entity ID. Returns the intelligence document with relationship history, key facts, and citations.",
    { context_id: z.string().describe("Context entity ID (from entity search or record lookup)") },
    { readOnlyHint: true },
    async ({ context_id }) => {
      const result = await client.get(`/v1/playbooks/by-context/${encodeURIComponent(context_id)}`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "list_workspace_playbooks",
    "List workspace-level playbooks (auto-detected patterns like 'Enterprise Churn Prevention', 'Affiliate Partnership Playbook'). These are team-level if/then rules distilled from your knowledge graph.",
    {},
    { readOnlyHint: true },
    async () => {
      const result = await client.get("/v1/playbooks/workspace");
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "get_workspace_playbook",
    "Get a workspace playbook by slug. Returns the full playbook with rules and confidence scores.",
    { slug: z.string().describe("Playbook slug (e.g. 'enterprise-churn-prevention')") },
    { readOnlyHint: true },
    async ({ slug }) => {
      const result = await client.get(`/v1/playbooks/workspace/${encodeURIComponent(slug)}`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "compile_brief",
    "Trigger compilation of an entity brief or workspace playbook. Queues a background job that generates or refreshes the intelligence document from the latest context graph data. At least one parameter is required.",
    {
      context_id: z.string().describe("Context entity ID to compile brief for (from entity search or playbook list)"),
      is_private: z.boolean().optional().describe("Create a private brief (default: false)"),
    },
    { readOnlyHint: false },
    async ({ context_id, is_private }) => {
      const body: Record<string, unknown> = { context_id };
      if (is_private !== undefined) body.is_private = is_private;
      const result = await client.post("/v1/playbooks/compile", body);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "get_brief_history",
    "Get version history for an entity brief or playbook. Shows what changed between versions with diff summaries.",
    { playbook_id: z.string().describe("Brief or playbook ID") },
    { readOnlyHint: true },
    async ({ playbook_id }) => {
      const result = await client.get(`/v1/playbooks/${encodeURIComponent(playbook_id)}/history`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}
