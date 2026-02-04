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

## Capabilities

### Query Context (Ask API)

Use this when you need to recall information about contacts, companies, or relationships.

**Endpoint**: `POST https://app.nex.ai/api/developers/v1/context/ask`

**Headers**:
- `Authorization: Bearer $NEX_API_KEY`
- `Content-Type: application/json`

**Request**:
```json
{
  "query": "What do I know about John Smith?"
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

**Headers**:
- `Authorization: Bearer $NEX_API_KEY`
- `Content-Type: application/json`

**Request**:
```json
{
  "content": "Had a great call with John Smith from Acme Corp. He mentioned they're expanding to APAC next quarter and looking for partners.",
  "context": "Sales call notes"
}
```

**Response**:
```json
{
  "artifact_id": "abc123"
}
```

**Check processing status**:
```
GET https://app.nex.ai/api/developers/v1/context/artifacts/abc123
```

**Status Response**:
```json
{
  "status": "completed",
  "entities_extracted": ["John Smith", "Acme Corp"],
  "entities_created": [{"id": 789, "name": "John Smith", "type": "contact"}],
  "insights": [{"content": "Acme Corp expanding to APAC", "confidence": 0.85}],
  "tasks": []
}
```

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
