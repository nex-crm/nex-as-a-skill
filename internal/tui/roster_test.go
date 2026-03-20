package tui

import (
	"strings"
	"testing"
	"time"
)

func TestRosterUpdateAgents(t *testing.T) {
	r := NewRoster()

	agents := []AgentEntry{
		{Slug: "writer", Name: "Writer", Phase: "idle"},
		{Slug: "coder", Name: "Coder", Phase: "stream_llm"},
	}
	r.UpdateAgents(agents)

	if len(r.agents) != 2 {
		t.Fatalf("expected 2 agents, got %d", len(r.agents))
	}
}

func TestRosterSpinnerActiveWhenAgentBusy(t *testing.T) {
	r := NewRoster()

	agents := []AgentEntry{
		{Slug: "coder", Name: "Coder", Phase: "build_context"},
	}
	r.UpdateAgents(agents)

	if !r.spinner.active {
		t.Fatal("expected spinner to be active when agent is in active phase")
	}
}

func TestRosterSpinnerInactiveWhenAllIdle(t *testing.T) {
	r := NewRoster()

	agents := []AgentEntry{
		{Slug: "coder", Name: "Coder", Phase: "idle"},
	}
	r.UpdateAgents(agents)

	if r.spinner.active {
		t.Fatal("expected spinner to be inactive when all agents are idle")
	}
}

func TestRosterSpinnerFrameAdvancesOnTick(t *testing.T) {
	r := NewRoster()
	agents := []AgentEntry{
		{Slug: "coder", Name: "Coder", Phase: "execute_tool"},
	}
	r.UpdateAgents(agents)

	initial := r.spinner.frame
	msg := SpinnerTickMsg{Time: time.Now()}
	r2, _ := r.Update(msg)

	if r2.spinner.frame == initial {
		t.Fatal("expected roster spinner frame to advance on tick")
	}
}

func TestRosterViewContainsHeader(t *testing.T) {
	r := NewRoster()
	view := r.View()
	if !strings.Contains(view, "AGENTS") {
		t.Fatal("expected roster view to contain 'AGENTS' header")
	}
}

func TestRosterViewContainsAgentName(t *testing.T) {
	r := NewRoster()
	r.UpdateAgents([]AgentEntry{
		{Slug: "hal", Name: "HAL 9000", Phase: "idle"},
	})
	view := r.View()
	if !strings.Contains(view, "HAL 9000") {
		t.Fatalf("expected roster view to contain agent name, got:\n%s", view)
	}
}

func TestRosterPhaseLabels(t *testing.T) {
	cases := []struct {
		phase string
		label string
	}{
		{"idle", "idle"},
		{"build_context", "ctx"},
		{"stream_llm", "llm"},
		{"execute_tool", "tool"},
		{"done", "done"},
		{"error", "err"},
	}
	for _, tc := range cases {
		got := phaseShortLabel(tc.phase)
		if got != tc.label {
			t.Errorf("phaseShortLabel(%q) = %q, want %q", tc.phase, got, tc.label)
		}
	}
}
