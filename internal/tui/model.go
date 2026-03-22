package tui

import (
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/nex-ai/nex-cli/internal/agent"
	"github.com/nex-ai/nex-cli/internal/api"
	"github.com/nex-ai/nex-cli/internal/config"
	"github.com/nex-ai/nex-cli/internal/orchestration"
	"github.com/nex-ai/nex-cli/internal/provider"
)

// ViewName identifies a top-level view.
type ViewName string

const (
	ViewStream ViewName = "stream"
	ViewHelp   ViewName = "help"
	ViewAgents ViewName = "agents"
)

// Model is the root bubbletea model that owns the stream view and agent infrastructure.
type Model struct {
	stream       StreamModel
	agentService *agent.AgentService
	msgRouter    *orchestration.MessageRouter
	agentEvents  chan tea.Msg

	currentView ViewName
	width       int
	height      int

	doublePress *DoublePress
	inputMode   InputMode

	welcomed  bool
	hasAPIKey bool
}

// NewModel creates the root model with an agent service, message router, and stream view.
func NewModel() Model {
	apiKey := config.ResolveAPIKey("")
	apiClient := api.NewClient(apiKey)
	streamResolver := provider.DefaultStreamFnResolver(apiClient)
	agentSvc := agent.NewAgentService(
		agent.WithStreamFnResolver(streamResolver),
		agent.WithClient(apiClient),
	)
	msgRouter := orchestration.NewMessageRouter()
	events := make(chan tea.Msg, 256)

	hasAPIKey := apiKey != ""

	// Load config for pack preference
	cfg, _ := config.Load()
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
			// Set system prompt based on role
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

	stream := NewStreamModel(agentSvc, msgRouter, events, delegator, teamLeadSlug)

	// Wire all agents for event forwarding
	for _, a := range agentSvc.List() {
		stream.wireAgent(a.Config.Slug)
	}
	stream.updateRoster()

	return Model{
		stream:       stream,
		agentService: agentSvc,
		msgRouter:    msgRouter,
		agentEvents:  events,
		currentView:  ViewStream,
		doublePress:  NewDoublePress(time.Second),
		inputMode:    ModeInsert,
		hasAPIKey:    hasAPIKey,
	}
}

// Init starts the spinner, agent event listener, and sends the contextual welcome message.
func (m Model) Init() tea.Cmd {
	welcomeText := "Welcome! Run /init to get started."
	if m.hasAPIKey {
		welcomeText = "Welcome to Nex CLI. Type a message or /help"
	}
	welcomeCmd := func() tea.Msg {
		return SlashResultMsg{Output: welcomeText}
	}
	return tea.Batch(
		m.stream.Init(),
		waitForAgentEvent(m.agentEvents),
		welcomeCmd,
	)
}

// Update handles all messages, routing to sub-models as appropriate.
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	resubscribe := false

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

	case tea.KeyMsg:
		// Ctrl+C always uses double-press — intercept before stream sees it.
		if msg.String() == "ctrl+c" {
			if m.doublePress.Press() {
				return m, tea.Quit
			}
			hint := func() tea.Msg {
				return SlashResultMsg{Output: "Press Ctrl+C again to exit"}
			}
			return m, hint
		}

		// Non-stream views: only handle navigation back to stream.
		if m.currentView != ViewStream {
			switch msg.String() {
			case "q", "esc", "c":
				m.currentView = ViewStream
			}
			return m, nil
		}

		// Stream view: check for top-level navigation actions.
		action := MapKey(m.inputMode, msg)
		switch action {
		case ActionInsertMode:
			m.inputMode = ModeInsert
		case ActionNormalMode:
			m.inputMode = ModeNormal
		case ActionHelp:
			m.currentView = ViewHelp
			return m, nil
		case ActionAgents:
			m.currentView = ViewAgents
			return m, nil
		}

	case AgentTextMsg, AgentDoneMsg, AgentErrorMsg, PhaseChangeMsg:
		resubscribe = true
	}

	// Forward message to stream (covers WindowSizeMsg, regular keys, agent events,
	// spinner ticks, slash results, and all other messages).
	var cmd tea.Cmd
	m.stream, cmd = m.stream.Update(msg)

	if resubscribe {
		return m, tea.Batch(cmd, waitForAgentEvent(m.agentEvents))
	}
	return m, cmd
}

// View renders based on the current top-level view.
func (m Model) View() string {
	switch m.currentView {
	case ViewHelp:
		return m.renderHelpView()
	case ViewAgents:
		return m.renderAgentsView()
	default:
		return m.stream.View()
	}
}

// renderHelpView renders the keybinding reference screen.
func (m Model) renderHelpView() string {
	title := TitleStyle.Render("Help — Keybindings")
	body := `
Normal Mode:
  j / ↓        Scroll down
  k / ↑        Scroll up
  g            Scroll to top
  G / End      Scroll to bottom
  Ctrl+D       Half page down
  Ctrl+U       Half page up
  i            Enter insert mode
  /            Search
  ?            Help (this screen)
  a            Agents list
  c            Back to chat
  q            Quit

Insert Mode:
  Esc          Normal mode
  Enter        Submit message
  Tab          Autocomplete next
  Shift+Tab    Autocomplete prev
  Ctrl+C       Cancel / exit hint
`
	footer := SystemStyle.Render("  Press 'q', 'esc', or 'c' to return.")
	return title + body + footer
}

// renderAgentsView renders the active agent list.
func (m Model) renderAgentsView() string {
	title := TitleStyle.Render("Active Agents")
	agents := m.agentService.List()
	if len(agents) == 0 {
		footer := SystemStyle.Render("  No agents active. Press 'c' or 'esc' to return.")
		return title + "\n\n" + footer
	}

	var lines []string
	lines = append(lines, title, "")
	for _, a := range agents {
		line := fmt.Sprintf("  %-24s  %s", a.Config.Name, a.State.Phase)
		lines = append(lines, line)
	}
	lines = append(lines, "")
	lines = append(lines, SystemStyle.Render("  Press 'c', 'esc', or 'q' to return."))
	return strings.Join(lines, "\n")
}
