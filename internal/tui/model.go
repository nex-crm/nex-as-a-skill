package tui

import (
	tea "github.com/charmbracelet/bubbletea"

	"github.com/nex-ai/nex-cli/internal/agent"
	"github.com/nex-ai/nex-cli/internal/orchestration"
)

// Model is the root bubbletea model that owns the stream view and agent infrastructure.
type Model struct {
	stream      StreamModel
	agentEvents chan tea.Msg
	width       int
	height      int
}

// NewModel creates the root model with an agent service, message router, and stream view.
func NewModel() Model {
	agentSvc := agent.NewAgentService()
	msgRouter := orchestration.NewMessageRouter()
	events := make(chan tea.Msg, 256)

	stream := NewStreamModel(agentSvc, msgRouter, events)

	// Bootstrap the default team-lead agent
	if _, err := agentSvc.CreateFromTemplate("team-lead", "team-lead"); err == nil {
		_ = agentSvc.Start("team-lead")
		stream.wireAgent("team-lead")
		if tmpl, ok := agentSvc.GetTemplate("team-lead"); ok {
			msgRouter.RegisterAgent("team-lead", tmpl.Expertise)
		}
	}
	stream.updateRoster()

	return Model{
		stream:      stream,
		agentEvents: events,
	}
}

// Init starts the spinner and the agent event listener.
func (m Model) Init() tea.Cmd {
	return tea.Batch(
		m.stream.Init(),
		waitForAgentEvent(m.agentEvents),
	)
}

// Update forwards all messages to the stream model and re-subscribes for agent events.
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
	}

	var cmd tea.Cmd
	m.stream, cmd = m.stream.Update(msg)

	var cmds []tea.Cmd
	if cmd != nil {
		cmds = append(cmds, cmd)
	}

	// Re-subscribe for the next agent event after processing one
	switch msg.(type) {
	case AgentTextMsg, AgentDoneMsg, AgentErrorMsg, PhaseChangeMsg:
		cmds = append(cmds, waitForAgentEvent(m.agentEvents))
	}

	return m, tea.Batch(cmds...)
}

// View delegates entirely to the stream view.
func (m Model) View() string {
	return m.stream.View()
}
