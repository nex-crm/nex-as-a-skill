package agent

import (
	"fmt"
	"strings"
)

// BuildTeamLeadPrompt generates the system prompt for a team-lead agent.
func BuildTeamLeadPrompt(lead AgentConfig, team []AgentConfig, packName string) string {
	var roster strings.Builder
	for _, a := range team {
		if a.Slug == lead.Slug {
			continue
		}
		roster.WriteString(fmt.Sprintf("- @%s (%s): %s\n", a.Slug, a.Name, strings.Join(a.Expertise, ", ")))
	}

	return fmt.Sprintf(`You are the %s of the %s. Your team consists of:
%s
When the user gives you a directive:
1. Analyze what needs to be done
2. Break it into sub-tasks for your team members
3. narrate your delegation plan, mentioning each agent by @slug
4. Example: "I'll have @research analyze the competitive landscape while @content drafts the positioning document."

Always delegate to the most appropriate specialist. Never do specialist work yourself.
Keep your delegation plan concise — one or two sentences per agent.`, lead.Name, packName, roster.String())
}

// BuildSpecialistPrompt generates the system prompt for a specialist agent.
func BuildSpecialistPrompt(specialist AgentConfig) string {
	return fmt.Sprintf(`You are %s, a specialist in %s.

You receive tasks from your team lead. Focus on your area of expertise.
Be thorough but concise. Report your findings clearly.
If you need information from the knowledge base, use the available tools.`,
		specialist.Name, strings.Join(specialist.Expertise, ", "))
}
