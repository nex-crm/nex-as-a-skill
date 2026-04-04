---
name: nex:ask
description: Ask Nex a question about organizational context, people, companies, deals, or meetings
---

Answer the user's question with direct Nex MCP tools first.
Use `search_knowledge` for broad or fuzzy queries, `search_entities` to resolve people or companies, `get_entity_brief` / `get_entity_profile` for known entities, and `get_tasks` for action-item questions.
Use `query_context` / `nex_ask` only if the question is genuinely open-ended and does not map cleanly to a direct primitive.

If the user provides a query, pass it directly. If not, ask what they'd like to know about their organizational context, CRM records, meetings, or communications.

Always present the response clearly, highlighting key entities (people, companies, deals) and any relevant dates or action items.
