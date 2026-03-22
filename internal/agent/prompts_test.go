package agent

import (
	"strings"
	"testing"
)

func TestBuildTeamLeadPrompt(t *testing.T) {
	lead := AgentConfig{Slug: "ceo", Name: "CEO", Expertise: []string{"strategy"}}
	team := []AgentConfig{
		{Slug: "fe", Name: "FE Engineer", Expertise: []string{"frontend", "React"}},
		{Slug: "be", Name: "BE Engineer", Expertise: []string{"backend", "APIs"}},
	}
	prompt := BuildTeamLeadPrompt(lead, team, "Founding Team")
	if !strings.Contains(prompt, "@fe") {
		t.Error("expected prompt to contain @fe")
	}
	if !strings.Contains(prompt, "@be") {
		t.Error("expected prompt to contain @be")
	}
	if !strings.Contains(prompt, "delegate") || !strings.Contains(prompt, "narrate") {
		t.Error("expected delegation instructions in prompt")
	}
}

func TestBuildSpecialistPrompt(t *testing.T) {
	specialist := AgentConfig{Slug: "fe", Name: "FE Engineer", Expertise: []string{"frontend", "React"}}
	prompt := BuildSpecialistPrompt(specialist)
	if !strings.Contains(prompt, "FE Engineer") {
		t.Error("expected specialist name in prompt")
	}
	if !strings.Contains(prompt, "frontend") {
		t.Error("expected expertise in prompt")
	}
}

func TestBuildTeamLeadPromptMentionsAllAgents(t *testing.T) {
	lead := AgentConfig{Slug: "ceo", Name: "CEO"}
	team := []AgentConfig{
		{Slug: "pm", Name: "PM", Expertise: []string{"roadmap"}},
		{Slug: "fe", Name: "FE", Expertise: []string{"frontend"}},
		{Slug: "be", Name: "BE", Expertise: []string{"backend"}},
	}
	prompt := BuildTeamLeadPrompt(lead, team, "Founding Team")
	for _, a := range team {
		if !strings.Contains(prompt, "@"+a.Slug) {
			t.Errorf("expected prompt to mention @%s", a.Slug)
		}
	}
}
