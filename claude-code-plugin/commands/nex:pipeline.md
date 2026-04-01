---
description: View deal pipeline and forecast
---
Handle pipeline requests: $ARGUMENTS

**No arguments or "view":** Use mcp__nex__get_pipeline to show deals grouped by stage with values.

**"forecast":** Use mcp__nex__get_forecast to show projected revenue.

**"move <deal> to <stage>":** Use mcp__nex__move_deal_stage with the deal ID and target stage.

**A deal name:** Use mcp__nex__search_records to find the deal, then mcp__nex__get_deal_brief for details.

Format pipeline as a visual stage breakdown. Show total value, weighted value, and deals per stage.
