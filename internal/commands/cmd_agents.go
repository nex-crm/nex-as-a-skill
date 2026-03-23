package commands

import (
	"fmt"
	"strings"
)

func cmdAgents(ctx *SlashContext, args string) error {
	if ctx.AgentService == nil {
		ctx.AddMessage("system", "Agent service not available.")
		return nil
	}
	agents := ctx.AgentService.List()
	if len(agents) == 0 {
		ctx.AddMessage("system", "No agents running.")
		return nil
	}
	var sb strings.Builder
	sb.WriteString("Active agents:\n")
	for _, a := range agents {
		sb.WriteString(fmt.Sprintf("  • %s (%s) — %s\n", a.Config.Name, a.Config.Slug, a.State.Phase))
	}
	ctx.AddMessage("system", strings.TrimRight(sb.String(), "\n"))
	return nil
}

func cmdAgent(ctx *SlashContext, args string) error {
	if args == "" {
		ctx.AddMessage("system", "Usage: /agent <slug>")
		return nil
	}
	if ctx.AgentService == nil {
		ctx.AddMessage("system", "Agent service not available.")
		return nil
	}
	ma, ok := ctx.AgentService.Get(args)
	if !ok {
		ctx.AddMessage("system", fmt.Sprintf("Agent %q not found.", args))
		return nil
	}
	info := fmt.Sprintf(
		"Agent: %s\nSlug:  %s\nPhase: %s\nExpertise: %s",
		ma.Config.Name, ma.Config.Slug, ma.State.Phase,
		strings.Join(ma.Config.Expertise, ", "),
	)
	ctx.AddMessage("system", info)
	return nil
}
