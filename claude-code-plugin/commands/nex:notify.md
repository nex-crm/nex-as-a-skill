---
description: Manage notifications, preferences, and custom notification rules in Nex
---
Manage Nex notifications based on: $ARGUMENTS

If no arguments or "list" provided, list recent notifications using `mcp__nex__get_notifications`.

If arguments include "preferences", show current notification settings using `mcp__nex__get_notification_preferences`.

If arguments include "set-frequency" followed by a number, update the polling frequency using `mcp__nex__set_notification_preferences` with `frequency_minutes` set to that number.

If arguments include "rule create" followed by a description, create a custom notification rule using `mcp__nex__create_notification_rule` with the description.

If arguments include "rule list", list all custom rules using `mcp__nex__list_notification_rules`.

If arguments include "rule delete" followed by an ID, delete the rule using `mcp__nex__delete_notification_rule`.

Format results clearly. For notifications, highlight type, importance, and content. For rules, show description and active status.
