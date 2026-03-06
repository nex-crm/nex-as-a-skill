Help the user connect third-party integrations (Gmail, Google Calendar, Outlook, Outlook Calendar, Slack, Attio, HubSpot, Salesforce) to their Nex workspace.

## Available Integrations

| Type | Provider | Display Name |
|------|----------|-------------|
| email | google | Gmail |
| calendar | google | Google Calendar |
| email | microsoft | Outlook |
| calendar | microsoft | Outlook Calendar |
| messaging | slack | Slack |
| crm | attio | Attio |
| crm | hubspot | HubSpot |
| crm | salesforce | Salesforce |

## Steps

1. First, list current integrations to see what's already connected:
   Use the `list_integrations` MCP tool.

2. To connect a new integration:
   Use the `connect_integration` MCP tool with the `type` and `provider` from the table above.
   This returns an `auth_url` — open it in the user's browser.

3. Poll for completion:
   Use the `get_connect_status` MCP tool with the `connect_id` every few seconds until `status` is `"connected"`.

4. To disconnect:
   Use the `disconnect_integration` MCP tool with the `connection_id`.
