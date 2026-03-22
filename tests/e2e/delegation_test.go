package e2e

import (
	"testing"

	"github.com/nex-ai/nex-cli/internal/agent"
	"github.com/nex-ai/nex-cli/internal/orchestration"
)

func TestDelegationFlow(t *testing.T) {
	// Create service with pack
	svc := agent.NewAgentService()
	pack := agent.GetPack("founding-team")
	if pack == nil {
		t.Fatal("founding-team pack not found")
	}

	for _, cfg := range pack.Agents {
		_, err := svc.Create(cfg)
		if err != nil {
			t.Fatalf("failed to create agent %s: %v", cfg.Slug, err)
		}
	}

	// Create delegator
	d := orchestration.NewDelegator(3)

	// Simulate team-lead response with delegations
	response := "I'll have @fe build the landing page while @be sets up the API endpoints."
	knownSlugs := []string{"pm", "fe", "be", "designer", "cmo", "cro"}

	delegations := d.ExtractDelegations(response, knownSlugs)
	if len(delegations) != 2 {
		t.Fatalf("expected 2 delegations, got %d", len(delegations))
	}

	// Verify steer messages can be sent
	for _, del := range delegations {
		msg := orchestration.FormatSteerMessage(del)
		err := svc.Steer(del.AgentSlug, msg)
		if err != nil {
			t.Errorf("failed to steer %s: %v", del.AgentSlug, err)
		}
	}
}

func TestDelegationFlowNoDelegation(t *testing.T) {
	d := orchestration.NewDelegator(3)

	// Response with no @mentions
	response := "I'll think about this and get back to you with a plan."
	knownSlugs := []string{"pm", "fe", "be", "designer", "cmo", "cro"}

	delegations := d.ExtractDelegations(response, knownSlugs)
	if len(delegations) != 0 {
		t.Errorf("expected 0 delegations, got %d", len(delegations))
	}
}

func TestPackBootstrap(t *testing.T) {
	pack := agent.GetPack("founding-team")
	if pack == nil {
		t.Fatal("founding-team pack not found")
	}

	svc := agent.NewAgentService()
	for _, cfg := range pack.Agents {
		_, err := svc.Create(cfg)
		if err != nil {
			t.Fatalf("failed to create agent %s: %v", cfg.Slug, err)
		}
	}

	// Verify all 7 agents exist
	for _, cfg := range pack.Agents {
		ma, ok := svc.Get(cfg.Slug)
		if !ok {
			t.Errorf("agent %s not found in service", cfg.Slug)
			continue
		}
		if ma.Config.Slug != cfg.Slug {
			t.Errorf("expected slug %s, got %s", cfg.Slug, ma.Config.Slug)
		}
	}

	// Verify List() returns all 7
	list := svc.List()
	if len(list) != 7 {
		t.Errorf("expected 7 agents from List(), got %d", len(list))
	}
}
