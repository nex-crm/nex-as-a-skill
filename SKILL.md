---
name: nex
description: Access your Nex CRM - manage records, lists, query your context graph, and receive real-time insights
emoji: "\U0001F4CA"
metadata: {"openclaw": {"requires": {"env": ["NEX_API_KEY"]}, "primaryEnv": "NEX_API_KEY"}}
---

# Nex - CRM & Context Graph for OpenClaw

Nex gives your AI agent full CRM access: create and manage records, query your context graph, process conversations, and receive real-time insights.

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
             "NEX_API_KEY": "sk-your_key_here"
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

## API Scopes

Each API key has scopes that control access. Request the scopes you need when creating your key at https://app.nex.ai/settings/developer

| Scope | Grants Access To |
|-------|-----------------|
| `object.read` | List objects, view schema |
| `record.read` | Get and list records |
| `record.write` | Create, update, upsert records |
| `list.read` | View lists |
| `list.member.read` | View list members |
| `list.member.write` | Add, update list members |
| `insight.stream` | Insights REST + SSE stream |

## Capabilities

### Objects & Schema Discovery

#### List Objects

Discover available object types (person, company, etc.) and their attribute schemas. **Call this first** to learn what fields are available before creating or querying records.

**Endpoint**: `GET https://app.nex.ai/api/developers/v1/objects`
**Scope**: `object.read`

**Query Parameters**:
- `include_attributes` (boolean, optional) — Set `true` to include attribute definitions

**How to call**:
```json
{
  "tool": "exec",
  "command": "curl -s 'https://app.nex.ai/api/developers/v1/objects?include_attributes=true' -H 'Authorization: Bearer $NEX_API_KEY'",
  "timeout": 120
}
```

**Response**:
```json
{
  "data": [
    {
      "id": "123",
      "slug": "person",
      "name": "Person",
      "name_plural": "People",
      "type": "object",
      "description": "A contact or person",
      "attributes": [
        {
          "id": "1",
          "slug": "name",
          "name": "Name",
          "type": "name",
          "options": {
            "is_required": true,
            "is_unique": false,
            "is_multi_value": false
          }
        },
        {
          "id": "2",
          "slug": "email",
          "name": "Email",
          "type": "email",
          "options": {
            "is_required": false,
            "is_unique": true
          }
        }
      ]
    }
  ]
}
```

#### List Object Lists

Get all lists associated with an object type.

**Endpoint**: `GET https://app.nex.ai/api/developers/v1/objects/{slug}/lists`
**Scope**: `list.read`

**Parameters**:
- `slug` (path) — Object type slug (e.g., `person`, `company`)
- `include_attributes` (query, optional) — Include attribute definitions

**How to call**:
```json
{
  "tool": "exec",
  "command": "curl -s 'https://app.nex.ai/api/developers/v1/objects/person/lists?include_attributes=true' -H 'Authorization: Bearer $NEX_API_KEY'",
  "timeout": 120
}
```

**Response**:
```json
{
  "data": [
    {
      "id": "456",
      "slug": "vip-contacts",
      "name": "VIP Contacts",
      "type": "list",
      "attributes": []
    }
  ]
}
```

---

### Records

#### Create Record

Create a new record for an object type.

**Endpoint**: `POST https://app.nex.ai/api/developers/v1/objects/{slug}`
**Scope**: `record.write`

**Parameters**:
- `slug` (path) — Object type slug (e.g., `person`, `company`)

**Request body**:
- `attributes` (required) — Must include `name` (string or object). Additional fields depend on the object schema.

**How to call**:
```json
{
  "tool": "exec",
  "command": "curl -s -X POST 'https://app.nex.ai/api/developers/v1/objects/person' -H 'Authorization: Bearer $NEX_API_KEY' -H 'Content-Type: application/json' -d '{\"attributes\":{\"name\":{\"first_name\":\"Jane\",\"last_name\":\"Doe\"},\"email\":\"jane@example.com\",\"company\":\"Acme Corp\"}}'",
  "timeout": 120
}
```

**Response**:
```json
{
  "id": "789",
  "object_id": "123",
  "type": "person",
  "workspace_id": "111",
  "attributes": {
    "name": {"first_name": "Jane", "last_name": "Doe"},
    "email": "jane@example.com",
    "company": "Acme Corp"
  },
  "created_at": "2026-02-11T10:00:00Z",
  "updated_at": "2026-02-11T10:00:00Z"
}
```

#### Upsert Record

Create a record if it doesn't exist, or update it if a match is found on the specified attribute.

**Endpoint**: `PUT https://app.nex.ai/api/developers/v1/objects/{slug}`
**Scope**: `record.write`

**Request body**:
- `attributes` (required) — Must include `name` when creating
- `matching_attribute` (required) — Slug or ID of the attribute to match on (e.g., `email`)

**How to call**:
```json
{
  "tool": "exec",
  "command": "curl -s -X PUT 'https://app.nex.ai/api/developers/v1/objects/person' -H 'Authorization: Bearer $NEX_API_KEY' -H 'Content-Type: application/json' -d '{\"matching_attribute\":\"email\",\"attributes\":{\"name\":\"Jane Doe\",\"email\":\"jane@example.com\",\"job_title\":\"VP of Sales\"}}'",
  "timeout": 120
}
```

#### Get Record

Retrieve a specific record by its ID.

**Endpoint**: `GET https://app.nex.ai/api/developers/v1/records/{record_id}`
**Scope**: `record.read`

**How to call**:
```json
{
  "tool": "exec",
  "command": "curl -s 'https://app.nex.ai/api/developers/v1/records/789' -H 'Authorization: Bearer $NEX_API_KEY'",
  "timeout": 120
}
```

#### Update Record

Update specific attributes on an existing record. Only the provided attributes are changed.

**Endpoint**: `PATCH https://app.nex.ai/api/developers/v1/records/{record_id}`
**Scope**: `record.write`

**Request body**:
- `attributes` — Object with the fields to update

**How to call**:
```json
{
  "tool": "exec",
  "command": "curl -s -X PATCH 'https://app.nex.ai/api/developers/v1/records/789' -H 'Authorization: Bearer $NEX_API_KEY' -H 'Content-Type: application/json' -d '{\"attributes\":{\"job_title\":\"CTO\",\"phone\":\"+1-555-0123\"}}'",
  "timeout": 120
}
```

#### List Records

List records for an object type with optional filtering, sorting, and pagination.

**Endpoint**: `POST https://app.nex.ai/api/developers/v1/objects/{slug}/records`
**Scope**: `record.read`

**Request body**:
- `attributes` — Which attributes to return: `"all"`, `"primary"`, `"none"`, or a custom object
- `limit` (integer) — Number of records to return
- `offset` (integer) — Pagination offset
- `sort` — Object with `attribute` (slug) and `direction` (`"asc"` or `"desc"`)

**How to call**:
```json
{
  "tool": "exec",
  "command": "curl -s -X POST 'https://app.nex.ai/api/developers/v1/objects/person/records' -H 'Authorization: Bearer $NEX_API_KEY' -H 'Content-Type: application/json' -d '{\"attributes\":\"all\",\"limit\":10,\"offset\":0,\"sort\":{\"attribute\":\"updated_at\",\"direction\":\"desc\"}}'",
  "timeout": 120
}
```

**Response**:
```json
{
  "data": [
    {
      "id": "789",
      "type": "person",
      "attributes": {"name": "Jane Doe", "email": "jane@example.com"},
      "created_at": "2026-02-11T10:00:00Z",
      "updated_at": "2026-02-11T10:00:00Z"
    }
  ],
  "total": 42,
  "limit": 10,
  "offset": 0
}
```

---

### Lists

#### Add List Member

Add an existing record to a list.

**Endpoint**: `POST https://app.nex.ai/api/developers/v1/lists/{id}`
**Scope**: `list.member.write`

**Parameters**:
- `id` (path) — List ID

**Request body**:
- `parent_id` (required) — ID of the existing record to add
- `attributes` (optional) — List-specific attribute values

**How to call**:
```json
{
  "tool": "exec",
  "command": "curl -s -X POST 'https://app.nex.ai/api/developers/v1/lists/456' -H 'Authorization: Bearer $NEX_API_KEY' -H 'Content-Type: application/json' -d '{\"parent_id\":\"789\",\"attributes\":{\"status\":\"active\"}}'",
  "timeout": 120
}
```

#### Upsert List Member

Add a record to a list, or update its list-specific attributes if already a member.

**Endpoint**: `PUT https://app.nex.ai/api/developers/v1/lists/{id}`
**Scope**: `list.member.write`

**How to call**:
```json
{
  "tool": "exec",
  "command": "curl -s -X PUT 'https://app.nex.ai/api/developers/v1/lists/456' -H 'Authorization: Bearer $NEX_API_KEY' -H 'Content-Type: application/json' -d '{\"parent_id\":\"789\",\"attributes\":{\"priority\":\"high\"}}'",
  "timeout": 120
}
```

#### List Records in a List

Get paginated records from a specific list.

**Endpoint**: `POST https://app.nex.ai/api/developers/v1/lists/{id}/records`
**Scope**: `list.member.read`

**Request body**: Same as List Records (`attributes`, `limit`, `offset`, `sort`)

**How to call**:
```json
{
  "tool": "exec",
  "command": "curl -s -X POST 'https://app.nex.ai/api/developers/v1/lists/456/records' -H 'Authorization: Bearer $NEX_API_KEY' -H 'Content-Type: application/json' -d '{\"attributes\":\"all\",\"limit\":20}'",
  "timeout": 120
}
```

#### Update List Record

Update list-specific attributes for a record within a list.

**Endpoint**: `PATCH https://app.nex.ai/api/developers/v1/lists/{id}/records/{record_id}`
**Scope**: `list.member.write`

**How to call**:
```json
{
  "tool": "exec",
  "command": "curl -s -X PATCH 'https://app.nex.ai/api/developers/v1/lists/456/records/789' -H 'Authorization: Bearer $NEX_API_KEY' -H 'Content-Type: application/json' -d '{\"attributes\":{\"status\":\"closed-won\"}}'",
  "timeout": 120
}
```

---

### Context & AI

#### Query Context (Ask API)

Use this when you need to recall information about contacts, companies, or relationships.

**Endpoint**: `POST https://app.nex.ai/api/developers/v1/context/ask`
**Scope**: `record.read`

**How to call**:
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

#### Add Context (ProcessText API)

Use this to ingest new information from conversations, meeting notes, or other text.

**Endpoint**: `POST https://app.nex.ai/api/developers/v1/context/text`
**Scope**: `record.write`

**Request body**:
- `content` (required) — The text to process
- `context` (optional) — Additional context about the text (e.g., "Sales call notes")

**How to call**:
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

After calling ProcessText, use Get Artifact Status to check processing results.

#### Get Artifact Status

Check the processing status and results after calling ProcessText.

**Endpoint**: `GET https://app.nex.ai/api/developers/v1/context/artifacts/{artifact_id}`
**Scope**: `record.read`

**How to call**:
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

**Status values**: `pending`, `processing`, `completed`, `failed`

**Typical workflow**:
1. Call ProcessText -> get `artifact_id`
2. Poll Get Artifact Status every 2-5 seconds
3. Stop when `status` is `completed` or `failed`
4. Report the extracted entities and insights to the user

#### Create AI List Job

Use natural language to search your context graph and generate a curated list of contacts or companies.

**Endpoint**: `POST https://app.nex.ai/api/developers/v1/context/list/jobs`
**Scope**: `record.read`

**Request body**:
- `query` (required) — Natural language search query (e.g., "all companies who have asked for a contract")
- `object_type` (optional) — `"contact"` or `"company"` (default: `"contact"`)
- `limit` (optional) — Number of results (default: 50, max: 100)
- `include_attributes` (optional) — Include all entity attribute values (default: false)

**How to call**:
```json
{
  "tool": "exec",
  "command": "curl -s -X POST 'https://app.nex.ai/api/developers/v1/context/list/jobs' -H 'Authorization: Bearer $NEX_API_KEY' -H 'Content-Type: application/json' -d '{\"query\":\"high priority contacts in enterprise deals\",\"object_type\":\"contact\",\"limit\":20,\"include_attributes\":true}'",
  "timeout": 120
}
```

**Response**:
```json
{
  "message": {
    "job_id": "12345678901234567",
    "status": "pending"
  }
}
```

#### Get AI List Job Status

Check status and results of an AI list generation job. Poll until `status` is `completed` or `failed`.

**Endpoint**: `GET https://app.nex.ai/api/developers/v1/context/list/jobs/{job_id}`
**Scope**: `record.read`

**Query Parameters**:
- `include_attributes` (boolean, optional) — Include full attributes for each entity

**How to call**:
```json
{
  "tool": "exec",
  "command": "curl -s 'https://app.nex.ai/api/developers/v1/context/list/jobs/12345678901234567?include_attributes=true' -H 'Authorization: Bearer $NEX_API_KEY'",
  "timeout": 120
}
```

**Response** (completed):
```json
{
  "message": {
    "job_id": "12345678901234567",
    "status": "completed",
    "created_at": "2026-02-11T10:00:00Z",
    "count": 5,
    "query_interpretation": "Finding contacts involved in enterprise-level deals marked as high priority",
    "entities": [
      {
        "id": "789",
        "name": "Jane Doe",
        "type": "contact",
        "reason": "Lead on $500K enterprise deal with Acme Corp, marked high priority",
        "highlights": [
          "Contract negotiation in progress",
          "Budget approved Q1 2026",
          "Executive sponsor confirmed"
        ],
        "attributes": {}
      }
    ]
  }
}
```

**Status values**: `pending`, `processing`, `completed`, `failed`

**Typical workflow**:
1. Create job with natural language query -> get `job_id`
2. Poll Get AI List Job Status every 2-5 seconds
3. Stop when `status` is `completed` or `failed`
4. Present the matched entities with reasons and highlights

---

### Insights

#### Get Insights (REST)

Query insights by time window. Supports two modes.

**Endpoint**: `GET https://app.nex.ai/api/developers/v1/insights`
**Scope**: `insight.stream`

**Query Parameters**:
- `last` — Duration window, e.g., `30m`, `2h`, `1h30m`
- `from` + `to` — UTC time range in RFC3339 format
- `limit` (optional) — Max results (default: 20, max: 100)

If neither `last` nor `from`/`to` is specified, returns the most recent insights (default 20).

**How to call**:

Last 30 minutes:
```json
{
  "tool": "exec",
  "command": "curl -s 'https://app.nex.ai/api/developers/v1/insights?last=30m' -H 'Authorization: Bearer $NEX_API_KEY'",
  "timeout": 120
}
```

Between two dates:
```json
{
  "tool": "exec",
  "command": "curl -s 'https://app.nex.ai/api/developers/v1/insights?from=2026-02-07T00:00:00Z&to=2026-02-08T00:00:00Z' -H 'Authorization: Bearer $NEX_API_KEY'",
  "timeout": 120
}
```

**When to use**:
- When polling periodically instead of maintaining SSE connection
- To get current insight state on startup
- As fallback when SSE connection drops
- To review insights from a specific time period

#### Real-time Insight Stream (SSE)

Receive insights as they are discovered in real time.

**Endpoint**: `GET https://app.nex.ai/api/developers/v1/insights/stream`
**Scope**: `insight.stream`

**How to connect**:
```bash
curl -N -s "https://app.nex.ai/api/developers/v1/insights/stream" \
  -H "Authorization: Bearer $NEX_API_KEY" \
  -H "Accept: text/event-stream"
```

**Connection behavior**:
- Server sends `: connected workspace_id=... token_id=...` on connection
- **Recent insights are replayed** immediately via `insight.replay` events (up to 20)
- Keepalive comments (`: keepalive`) sent every 30 seconds
- Real-time events arrive as: `event: insight.batch.created\ndata: {...}\n\n`

**Event payload structure**:
```json
{
  "workspace": {
    "name": "Acme Corp",
    "slug": "acme",
    "business_info": {"name": "Acme Corp", "domain": "acme.com"}
  },
  "insights": [{
    "type": "opportunity",
    "type_description": "A potential business opportunity",
    "content": "Budget approval expected next quarter",
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
  "insight_count": 1,
  "emitted_at": "2026-02-05T10:30:00Z"
}
```

**Insight types**: `opportunity`, `risk`, `relationship`, `preference`, `milestone`, `activity`, `characteristic`, `role_detail`

**When to use**: Keep the SSE connection open in the background during active conversations. For one-off queries, use the Ask API instead.

## Error Handling

| Status Code | Meaning | Action |
|-------------|---------|--------|
| 400 | Invalid request | Check request body and parameters |
| 401 | Invalid API key | Check NEX_API_KEY is set correctly |
| 403 | Missing scope | Verify API key has the required scope |
| 404 | Not found | Check the record/object/list ID exists |
| 429 | Rate limited | Wait and retry with exponential backoff |
| 500 | Server error | Retry after a brief delay |

## When to Use Nex

**Good use cases**:
- Before responding to a message, query for context about the person
- After a conversation, process the transcript to update the context graph
- When asked about relationships or history with contacts/companies
- Creating or updating CRM records from conversation context
- Building targeted lists from your contact database
- Looking up record details before a meeting

**Not for**:
- General knowledge questions (use web search)
- Real-time calendar/scheduling (use calendar tools)
- Direct CRM data entry that requires the full Nex UI
