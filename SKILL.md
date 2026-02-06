---
name: nex
description: Access your Nex CRM Context Graph - query entities, process conversations, and receive real-time insights
emoji: "\U0001F4CA"
metadata: {"openclaw": {"requires": {"env": ["NEX_API_KEY"]}, "primaryEnv": "NEX_API_KEY"}}
---

# Nex - Context Graph for OpenClaw

Give your AI agent memory and context awareness. Nex provides a Context Graph that captures relationships, insights, and signals from your conversations.

## Setup

1. Get your API key from https://app.nex.ai/settings/developer
2. Add to `~/.openclaw/openclaw.json`:
   ```json
   {
     "skills": {
       "entries": {
         "nex": {
           "enabled": true,
           "env": {
             "NEX_API_KEY": "nex_dev_your_key_here"
           }
         }
       }
     }
   }
   ```

## How to Make API Calls

**CRITICAL**: The Nex API can take 10-60 seconds to respond. You MUST set `timeout: 120` on the exec tool call.

When using the `exec` tool, always include:
```json
{
  "tool": "exec",
  "command": "curl -s -X POST ...",
  "timeout": 120
}
```

Example curl command:
```bash
curl -s -X POST "https://app.nex.ai/api/developers/v1/context/ask" \
  -H "Authorization: Bearer $NEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"your query here"}'
```

## Capabilities

### Query Context (Ask API)

Use this when you need to recall information about contacts, companies, or relationships.

**Endpoint**: `POST https://app.nex.ai/api/developers/v1/context/ask`

**How to call** (use exec tool with timeout: 120):
```json
{
  "tool": "exec",
  "command": "curl -s -X POST 'https://app.nex.ai/api/developers/v1/context/ask' -H 'Authorization: Bearer $NEX_API_KEY' -H 'Content-Type: application/json' -d '{\"query\":\"What do I know about John Smith?\"}'",
  "timeout": 120
}
```

**Response**:
```json
{
  "answer": "John Smith is a VP of Sales at Acme Corp...",
  "entities_considered": [
    {"id": 123, "name": "John Smith", "type": "contact"}
  ],
  "signals_used": [
    {"id": 456, "content": "Met at conference last month"}
  ],
  "metadata": {
    "query_type": "entity_specific"
  }
}
```

**Example queries**:
- "Who are my most engaged contacts this week?"
- "What companies are we working with in the healthcare sector?"
- "What was discussed in my last meeting with Sarah?"

### Add Context (ProcessText API)

Use this to ingest new information from conversations, meeting notes, or other text.

**Endpoint**: `POST https://app.nex.ai/api/developers/v1/context/text`

**How to call** (use exec tool with timeout: 120):
```json
{
  "tool": "exec",
  "command": "curl -s -X POST 'https://app.nex.ai/api/developers/v1/context/text' -H 'Authorization: Bearer $NEX_API_KEY' -H 'Content-Type: application/json' -d '{\"content\":\"Had a great call with John Smith from Acme Corp.\",\"context\":\"Sales call notes\"}'",
  "timeout": 120
}
```

**Response**:
```json
{
  "artifact_id": "abc123"
}
```

After calling ProcessText, use the Get Artifact Status API to check processing results.

### Get Artifact Status (After ProcessText)

Use this to check the processing status and results after calling ProcessText.

**Endpoint**: `GET https://app.nex.ai/api/developers/v1/context/artifacts/{artifact_id}`

**How to call** (use exec tool with timeout: 120):
```json
{
  "tool": "exec",
  "command": "curl -s 'https://app.nex.ai/api/developers/v1/context/artifacts/abc123' -H 'Authorization: Bearer $NEX_API_KEY'",
  "timeout": 120
}
```

**Response**:
```json
{
  "operation_id": 48066188026052610,
  "status": "completed",
  "result": {
    "entities_extracted": [
      {"name": "John Smith", "type": "PERSON", "action": "created"},
      {"name": "Acme Corp", "type": "COMPANY", "action": "updated"}
    ],
    "entities_created": 1,
    "entities_updated": 1,
    "relationships": 1,
    "insights": [
      {"content": "Acme Corp expanding to APAC", "confidence": 0.85}
    ],
    "tasks": []
  },
  "created_at": "2026-02-05T10:30:00Z",
  "completed_at": "2026-02-05T10:30:15Z"
}
```

**Status values**:
- `pending` - Queued for processing
- `processing` - Currently being analyzed
- `completed` - Successfully processed
- `failed` - Processing failed (check `error` field)

**Typical workflow**:
1. Call ProcessText -> get `artifact_id`
2. Poll Get Artifact Status every 2-5 seconds
3. Stop polling when `status` is `completed` or `failed`
4. Report the extracted entities and insights to the user

**Error responses**:
| Status Code | Meaning |
|-------------|---------|
| 400 | Invalid artifact ID format |
| 404 | Artifact not found |

### Real-time Insight Stream (SSE)

Use this to receive insights as they are discovered from your context operations.

**IMPORTANT**: Your API key must have the `insight.stream` scope. Request this scope when generating your key at https://app.nex.ai/settings/developer

**Endpoint**: `GET https://app.nex.ai/api/developers/v1/insights/stream`

**How to connect** (use curl with streaming):
```bash
curl -N -s "https://app.nex.ai/api/developers/v1/insights/stream" \
  -H "Authorization: Bearer $NEX_API_KEY" \
  -H "Accept: text/event-stream"
```

**Connection behavior**:
- Server sends `: connected workspace_id=... token_id=...` on connection
- **Recent insights are replayed** immediately after connection via `insight.replay` events (up to 20 most recent)
- Keepalive comments (`: keepalive`) sent every 30 seconds
- Real-time events arrive as SSE format: `event: insight.batch.created\ndata: {...}\n\n`

**Event types**:
- `insight.batch.created` - Real-time: new insights just discovered
- `insight.replay` - Historical: recent insights sent on connection (simplified format)

**Event payload structure**:
```json
{
  "workspace": {
    "name": "Acme Corp",
    "slug": "acme",
    "business_info": {"name": "Acme Corp", "domain": "acme.com"},
    "settings": {"date_format": "MM/DD/YYYY"}
  },
  "insights": [{
    "type": "opportunity",
    "type_description": "A potential business opportunity identified from context",
    "content": "John mentioned budget approval expected next quarter",
    "confidence": 0.85,
    "confidence_level": "high",
    "target": {
      "type": "entity",
      "entity_type": "person",
      "hint": "John Smith",
      "signals": [{"type": "email", "value": "john@acme.com"}]
    },
    "evidence": [{
      "excerpt": "We should have budget approval by Q2",
      "artifact": {"type": "email", "subject": "RE: Proposal"}
    }]
  }],
  "operation_id": 12345,
  "insight_count": 1,
  "emitted_at": "2026-02-05T10:30:00Z"
}
```

**Insight types**:
- `opportunity` - A potential business opportunity
- `risk` - A potential risk or concern
- `relationship` - Information about entity relationships
- `preference` - Contact preferences or patterns
- `milestone` - Important dates or events

**When to use streaming**:
- Keep the SSE connection open in the background while working
- When new insights arrive, incorporate them into your understanding
- Particularly useful during active conversations where context is being added

**When NOT to use streaming**:
- For one-off queries, use the Ask API instead
- If you only need historical data, Ask API is more efficient

### Recent Insights (REST Fallback)

Use this when you can't maintain a persistent SSE connection but need recent insights.

**Endpoint**: `GET https://app.nex.ai/api/developers/v1/insights/recent`

**Query Parameters**:
- `limit` (optional): Number of insights to return (default: 20, max: 100)

**How to call**:
```bash
curl -s "https://app.nex.ai/api/developers/v1/insights/recent?limit=10" \
  -H "Authorization: Bearer $NEX_API_KEY"
```

**Response**: Same enriched payload structure as SSE events (see above).

**When to use**:
- When polling periodically instead of maintaining SSE connection
- To get current insight state on startup
- As fallback when SSE connection drops

## Error Handling

| Status Code | Meaning | Action |
|-------------|---------|--------|
| 401 | Invalid API key | Check NEX_API_KEY is set correctly |
| 403 | Insufficient permissions | Verify API key has required scopes |
| 429 | Rate limited | Wait and retry with exponential backoff |
| 500 | Server error | Retry after a brief delay |

## When to Use Nex

**Good use cases**:
- Before responding to a message, query for context about the person
- After a conversation, process the transcript to update the context graph
- When asked about relationships or history with contacts/companies

**Not for**:
- General knowledge questions (use web search)
- Real-time calendar/scheduling (use calendar tools)
- Direct CRM data entry (use Nex web app)
