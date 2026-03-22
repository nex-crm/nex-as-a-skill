package orchestration

import (
	"testing"
	"time"
)

func TestMessageRouter_ExtractSkills(t *testing.T) {
	mr := NewMessageRouter()

	tests := []struct {
		msg      string
		wantAny  []string
	}{
		{"Can you research our competitors?", []string{"market-research", "competitive-analysis"}},
		{"Find me new leads and outreach targets", []string{"prospecting", "outreach"}},
		{"Fix the bug in the code", []string{"general", "planning"}},
		{"Help with SEO and keyword ranking", []string{"seo", "content-analysis"}},
		{"Hello", nil},
	}

	for _, tt := range tests {
		skills := mr.ExtractSkills(tt.msg)
		if len(tt.wantAny) == 0 {
			if len(skills) != 0 {
				t.Errorf("msg %q: expected no skills, got %v", tt.msg, skills)
			}
			continue
		}
		found := false
		for _, want := range tt.wantAny {
			for _, got := range skills {
				if got == want {
					found = true
				}
			}
		}
		if !found {
			t.Errorf("msg %q: expected one of %v in skills %v", tt.msg, tt.wantAny, skills)
		}
	}
}

func TestMessageRouter_RoutesToBestAgent(t *testing.T) {
	mr := NewMessageRouter()
	agents := []AgentInfo{
		{Slug: "researcher", Expertise: []string{"market-research", "competitive-analysis"}},
		{Slug: "coder", Expertise: []string{"general", "planning"}},
	}

	result := mr.Route("Can you research our market?", agents)
	if result.Primary != "researcher" {
		t.Errorf("expected researcher, got %s", result.Primary)
	}
	if result.IsFollowUp {
		t.Error("should not be a follow-up")
	}
}

func TestMessageRouter_RoutesToTeamLeadWhenNoSkills(t *testing.T) {
	mr := NewMessageRouter()
	result := mr.Route("Hello there", []AgentInfo{
		{Slug: "researcher", Expertise: []string{"market-research"}},
	})
	if result.Primary != "team-lead" {
		t.Errorf("expected team-lead, got %s", result.Primary)
	}
}

func TestMessageRouter_DetectsFollowUp(t *testing.T) {
	mr := NewMessageRouter()
	mr.mu.Lock()
	mr.recentThreads["researcher"] = &threadContext{
		agentSlug:    "researcher",
		lastActivity: time.Now(),
	}
	mr.mu.Unlock()

	agents := []AgentInfo{
		{Slug: "researcher", Expertise: []string{"market-research"}},
	}
	result := mr.Route("Also what about their pricing?", agents)
	if !result.IsFollowUp {
		t.Error("should be detected as follow-up")
	}
	if result.Primary != "researcher" {
		t.Errorf("expected researcher, got %s", result.Primary)
	}
}

func TestMessageRouter_FollowUpExpires(t *testing.T) {
	mr := NewMessageRouter()
	mr.followUpWindow = 10 * time.Millisecond
	mr.mu.Lock()
	mr.recentThreads["researcher"] = &threadContext{
		agentSlug:    "researcher",
		lastActivity: time.Now().Add(-100 * time.Millisecond),
	}
	mr.mu.Unlock()

	result := mr.Route("Also what about their pricing?", []AgentInfo{
		{Slug: "team-lead", Expertise: []string{}},
	})
	if result.IsFollowUp {
		t.Error("follow-up window should have expired")
	}
}

func TestRouteUsesConfiguredTeamLead(t *testing.T) {
	router := NewMessageRouter()
	router.SetTeamLeadSlug("ceo")
	router.RegisterAgent("ceo", []string{"strategy", "delegation"})
	router.RegisterAgent("pm", []string{"roadmap", "requirements"})

	agents := []AgentInfo{
		{Slug: "ceo", Expertise: []string{"strategy"}},
		{Slug: "pm", Expertise: []string{"roadmap"}},
	}

	result := router.Route("do something random", agents)
	if result.Primary != "ceo" {
		t.Errorf("expected primary='ceo', got '%s'", result.Primary)
	}
}

func TestMessageRouter_RecordActivity(t *testing.T) {
	mr := NewMessageRouter()
	mr.RecordAgentActivity("agent-x")
	mr.mu.Lock()
	tc, ok := mr.recentThreads["agent-x"]
	mr.mu.Unlock()
	if !ok {
		t.Fatal("activity should be recorded")
	}
	if time.Since(tc.lastActivity) > time.Second {
		t.Error("last activity should be recent")
	}
}
