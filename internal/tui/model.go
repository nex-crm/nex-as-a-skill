package tui

import (
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/nex-ai/nex-cli/internal/chat"
	"github.com/nex-ai/nex-cli/internal/config"
)

// ViewName identifies a top-level view.
type ViewName string

const (
	ViewStream ViewName = "stream"
	ViewHelp   ViewName = "help"
	ViewAgents ViewName = "agents"
	ViewChat   ViewName = "chat"
)

// Model is the root bubbletea model that owns the stream view and agent infrastructure.
type Model struct {
	stream  StreamModel
	runtime *Runtime

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
	events := make(chan tea.Msg, 256)
	rt := NewRuntime(events)

	hasAPIKey := config.ResolveAPIKey("") != ""

	stream := NewStreamModel(rt, events)

	// Wire all agents for event forwarding
	for _, a := range rt.AgentService.List() {
		stream.wireAgent(a.Config.Slug)
	}
	stream.updateRoster()

	return Model{
		stream:      stream,
		runtime:     rt,
		currentView: ViewStream,
		doublePress: NewDoublePress(time.Second),
		inputMode:   ModeInsert,
		hasAPIKey:   hasAPIKey,
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
		waitForAgentEvent(m.runtime.Events),
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

	case ViewSwitchMsg:
		m.currentView = msg.Target
		return m, nil

	case AgentTextMsg, AgentDoneMsg, AgentErrorMsg, PhaseChangeMsg,
		AgentThinkingMsg, AgentToolUseMsg, AgentToolResultMsg:
		resubscribe = true
	}

	// Forward message to stream (covers WindowSizeMsg, regular keys, agent events,
	// spinner ticks, slash results, and all other messages).
	var cmd tea.Cmd
	m.stream, cmd = m.stream.Update(msg)

	if resubscribe {
		return m, tea.Batch(cmd, waitForAgentEvent(m.runtime.Events))
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
	case ViewChat:
		return m.renderChatView()
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
	agents := m.runtime.AgentService.List()
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

// renderChatView renders the chat channels and recent messages.
func (m Model) renderChatView() string {
	title := TitleStyle.Render("Chat Channels")

	cm, err := chat.NewChannelManager()
	if err != nil {
		return title + "\n\n" + SystemStyle.Render("  Error loading channels: "+err.Error()) +
			"\n\n" + SystemStyle.Render("  Press 'c', 'esc', or 'q' to return.")
	}

	channels := cm.List()
	if len(channels) == 0 {
		return title + "\n\n" + SystemStyle.Render("  No chat channels yet. Agent messages will create channels automatically.") +
			"\n\n" + SystemStyle.Render("  Press 'c', 'esc', or 'q' to return.")
	}

	var lines []string
	lines = append(lines, title, "")

	ms, msErr := chat.NewMessageStore()

	for _, ch := range channels {
		icon := "#"
		if ch.Type == chat.ChannelDirect {
			icon = "@"
		}
		header := fmt.Sprintf("  %s%-20s  (%s)  %d members", icon, ch.Name, ch.Type, len(ch.Members))
		lines = append(lines, header)

		if msErr == nil {
			msgs, _ := ms.List(ch.ID, 3)
			for _, msg := range msgs {
				ts := msg.Timestamp.Format("15:04")
				lines = append(lines, fmt.Sprintf("    [%s] %s: %s", ts, msg.SenderName, msg.Content))
			}
		}
		lines = append(lines, "")
	}

	lines = append(lines, SystemStyle.Render("  Press 'c', 'esc', or 'q' to return."))
	return strings.Join(lines, "\n")
}
