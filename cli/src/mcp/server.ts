import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NexApiClient } from "./client.js";
import { registerContextTools } from "./tools/context.js";
import { registerSearchTools } from "./tools/search.js";
import { registerSchemaTools } from "./tools/schema.js";
import { registerRecordTools } from "./tools/records.js";
import { registerRelationshipTools } from "./tools/relationships.js";
import { registerListTools } from "./tools/lists.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerNoteTools } from "./tools/notes.js";
import { registerInsightTools } from "./tools/insights.js";
import { registerRegistrationTools } from "./tools/register.js";
import { registerScanTools } from "./tools/scan.js";
import { registerIntegrationTools } from "./tools/integrations.js";
import { registerNotificationTools } from "./tools/notifications.js";
import { registerPlaybookTools } from "./tools/playbooks.js";
import { registerCrmTools } from "./tools/crm.js";
import { registerApprovalTools } from "./tools/approval.js";
import { registerPolicyTools } from "./tools/policy.js";
import { registerActionTools } from "./tools/actions.js";
import { registerPipelineTools } from "./tools/pipeline.js";

export function createServer(apiKey?: string): {
  server: McpServer;
  client: NexApiClient;
} {
  const server = new McpServer(
    { name: "nex", version: "0.1.0" },
    {
      capabilities: {
        experimental: { "claude/channel": {} },
      },
      instructions:
        'Events from the nex channel arrive as <channel source="nex" type="...">. ' +
        "They contain daily digest summaries (type=daily_digest) and proactive " +
        "notifications (type=proactive_notification) about important context " +
        "changes — deals, meetings, relationships, tasks. These are one-way " +
        "informational: acknowledge them naturally and incorporate into your " +
        "awareness. No reply expected.",
    },
  );

  const client = new NexApiClient(apiKey);

  registerRegistrationTools(server, client);
  registerContextTools(server, client);
  registerSearchTools(server, client);
  registerSchemaTools(server, client);
  registerRecordTools(server, client);
  registerRelationshipTools(server, client);
  registerListTools(server, client);
  registerTaskTools(server, client);
  registerNoteTools(server, client);
  registerInsightTools(server, client);
  registerScanTools(server, client);
  registerIntegrationTools(server, client);
  registerNotificationTools(server, client);
  registerPlaybookTools(server, client);
  registerCrmTools(server, client);
  registerApprovalTools(server, client);
  registerPolicyTools(server, client);
  registerActionTools(server, client);
  registerPipelineTools(server, client);

  return { server, client };
}
