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
      entity_id: z.string().optional().describe("Entity ID to compile brief for (required for entity briefs)"),
      playbook_type: z.enum(["entity", "workspace"]).default("entity").describe("Type of playbook to compile"),
    },
    { readOnlyHint: false },
    async ({ entity_id, playbook_type }) => {
      if (playbook_type === "entity" && !entity_id) {
        return { content: [{ type: "text", text: "Error: entity_id is required when compiling entity briefs." }] };
      }
      const body: Record<string, unknown> = { playbook_type };
      if (entity_id !== undefined) body.entity_id = entity_id;
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
