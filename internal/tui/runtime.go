package tui

import (
	tea "github.com/charmbracelet/bubbletea"

	"github.com/nex-ai/nex-cli/internal/agent"
	"github.com/nex-ai/nex-cli/internal/api"
	"github.com/nex-ai/nex-cli/internal/config"
	"github.com/nex-ai/nex-cli/internal/orchestration"
	"github.com/nex-ai/nex-cli/internal/provider"
)

// Runtime owns the live agent infrastructure and can rebuild it when config changes.
type Runtime struct {
	AgentService  *agent.AgentService
	MessageRouter *orchestration.MessageRouter
	Delegator     *orchestration.Delegator
	TeamLeadSlug  string
	PackSlug      string
	Events        chan tea.Msg
}

// NewRuntime creates a Runtime and bootstraps agents from the current config.
func NewRuntime(events chan tea.Msg) *Runtime {
	rt := &Runtime{
		Events: events,
	}
	rt.BootstrapFromConfig()
	return rt
}

// BootstrapFromConfig loads config, creates the agent service, message router,
// delegator, and populates agents from the configured pack.
func (rt *Runtime) BootstrapFromConfig() {
	cfg, _ := config.Load()

	apiKey := config.ResolveAPIKey("")
	apiClient := api.NewClient(apiKey)
	streamResolver := provider.DefaultStreamFnResolver(apiClient)
	agentSvc := agent.NewAgentService(
		agent.WithStreamFnResolver(streamResolver),
		agent.WithClient(apiClient),
	)
	msgRouter := orchestration.NewMessageRouter()

	packSlug := cfg.Pack
	if packSlug == "" {
		packSlug = "founding-team"
	}

	teamLeadSlug := cfg.TeamLeadSlug

	// Bootstrap agents from pack definition
	pack := agent.GetPack(packSlug)
	if pack != nil {
		teamLeadSlug = pack.LeadSlug
		for _, agentCfg := range pack.Agents {
			enriched := agentCfg
			if agentCfg.Slug == pack.LeadSlug {
				enriched.Personality = agent.BuildTeamLeadPrompt(agentCfg, pack.Agents, pack.Name)
			} else {
				enriched.Personality = agent.BuildSpecialistPrompt(agentCfg)
			}
			if _, err := agentSvc.Create(enriched); err == nil {
				_ = agentSvc.Start(agentCfg.Slug)
			}
			msgRouter.RegisterAgent(agentCfg.Slug, agentCfg.Expertise)
		}
	} else {
		// Fallback: create single team-lead
		teamLeadSlug = "team-lead"
		if _, err := agentSvc.CreateFromTemplate("team-lead", "team-lead"); err == nil {
			_ = agentSvc.Start("team-lead")
		}
		if tmpl, ok := agentSvc.GetTemplate("team-lead"); ok {
			msgRouter.RegisterAgent("team-lead", tmpl.Expertise)
		}
	}
	msgRouter.SetTeamLeadSlug(teamLeadSlug)

	maxConcurrent := cfg.MaxConcurrent
	if maxConcurrent <= 0 {
		maxConcurrent = 3
	}
	delegator := orchestration.NewDelegator(maxConcurrent)

	rt.AgentService = agentSvc
	rt.MessageRouter = msgRouter
	rt.Delegator = delegator
	rt.TeamLeadSlug = teamLeadSlug
	rt.PackSlug = packSlug
}

// Reconfigure tears down all running agents and rebuilds from current config.
func (rt *Runtime) Reconfigure() {
	// Stop and remove all existing agents.
	if rt.AgentService != nil {
		for _, ma := range rt.AgentService.List() {
			_ = rt.AgentService.Remove(ma.Config.Slug)
		}
	}
	rt.BootstrapFromConfig()
}
