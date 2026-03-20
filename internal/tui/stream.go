package tui

import (
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/nex-ai/nex-cli/internal/agent"
	"github.com/nex-ai/nex-cli/internal/orchestration"
)

// StreamMessage represents a message in the chat stream.
type StreamMessage struct {
	Role      string // "user", "agent", "system"
	AgentSlug string
	AgentName string
	Content   string
	Timestamp time.Time
}

// defaultSlashCommands are the built-in slash commands for autocomplete.
var defaultSlashCommands = []SlashCommand{
	{Name: "help", Description: "Show available commands"},
	{Name: "clear", Description: "Clear chat history"},
	{Name: "quit", Description: "Exit nex"},
	{Name: "q", Description: "Exit nex (shorthand)"},
}

// StreamModel is the main chat stream view with agent roster sidebar.
type StreamModel struct {
	messages     []StreamMessage
	inputValue   []rune
	inputPos     int
	autocomplete AutocompleteModel
	mention      MentionModel
	picker       PickerModel
	confirm      ConfirmModel
	roster       RosterModel
	spinner      SpinnerModel
	statusBar    StatusBarModel

	agentService  *agent.AgentService
	messageRouter *orchestration.MessageRouter
	agentEvents   chan tea.Msg

	width, height int
	scrollOffset  int
	loading       bool
	mode          string // "normal" or "insert"

	streaming   map[string]string // partial text per agent slug
	wiredAgents map[string]bool   // agents with event handlers registered
}

// NewStreamModel creates a new StreamModel wired to the agent service and message router.
func NewStreamModel(agentSvc *agent.AgentService, msgRouter *orchestration.MessageRouter, events chan tea.Msg) StreamModel {
	m := StreamModel{
		autocomplete:  NewAutocomplete(defaultSlashCommands),
		mention:       NewMention(nil),
		roster:        NewRoster(),
		spinner:       NewSpinner(""),
		statusBar:     NewStatusBar(),
		agentService:  agentSvc,
		messageRouter: msgRouter,
		agentEvents:   events,
		mode:          "insert",
		streaming:     make(map[string]string),
		wiredAgents:   make(map[string]bool),
	}
	m.statusBar.Mode = "INSERT"
	m.statusBar.Breadcrumbs = []string{"stream"}
	m.messages = append(m.messages, StreamMessage{
		Role:      "system",
		Content:   "Welcome to nex. Type a message or /help for commands.",
		Timestamp: time.Now(),
	})
	return m
}

// Init returns the initial commands (spinner tick).
func (m StreamModel) Init() tea.Cmd {
	return m.spinner.Tick()
}

// Update handles all incoming messages.
func (m StreamModel) Update(msg tea.Msg) (StreamModel, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.statusBar.Width = msg.Width

	case tea.KeyMsg:
		if msg.String() == "ctrl+c" {
			return m, tea.Quit
		}
		if m.picker.IsActive() {
			var cmd tea.Cmd
			m.picker, cmd = m.picker.Update(msg)
			return m, cmd
		}
		if m.confirm.IsActive() {
			var cmd tea.Cmd
			m.confirm, cmd = m.confirm.Update(msg)
			return m, cmd
		}
		if m.mode == "insert" {
			return m.updateInsertMode(msg)
		}
		return m.updateNormalMode(msg)

	case AgentTextMsg:
		m.streaming[msg.AgentSlug] = m.streaming[msg.AgentSlug] + msg.Text

	case AgentDoneMsg:
		if text, ok := m.streaming[msg.AgentSlug]; ok && text != "" {
			agentName := msg.AgentSlug
			if ma, ok := m.agentService.Get(msg.AgentSlug); ok {
				agentName = ma.Config.Name
			}
			m.messages = append(m.messages, StreamMessage{
				Role:      "agent",
				AgentSlug: msg.AgentSlug,
				AgentName: agentName,
				Content:   text,
				Timestamp: time.Now(),
			})
			delete(m.streaming, msg.AgentSlug)
		}
		m.loading = m.hasActiveAgents()
		if !m.loading {
			m.spinner.SetActive(false)
		}
		m.updateRoster()

	case AgentErrorMsg:
		delete(m.streaming, msg.AgentSlug)
		m.messages = append(m.messages, StreamMessage{
			Role:      "system",
			Content:   fmt.Sprintf("Error from %s: %v", msg.AgentSlug, msg.Err),
			Timestamp: time.Now(),
		})
		m.loading = m.hasActiveAgents()
		if !m.loading {
			m.spinner.SetActive(false)
		}
		m.updateRoster()

	case PhaseChangeMsg:
		m.updateRoster()

	case SpinnerTickMsg:
		var sCmd tea.Cmd
		m.spinner, sCmd = m.spinner.Update(msg)
		cmds = append(cmds, sCmd)
		var rCmd tea.Cmd
		m.roster, rCmd = m.roster.Update(msg)
		cmds = append(cmds, rCmd)

	case PickerSelectMsg:
		m.picker.SetActive(false)

	case ConfirmMsg:
		m.confirm.SetActive(false)

	case SlashResultMsg:
		if msg.Err != nil {
			m.messages = append(m.messages, StreamMessage{
				Role:      "system",
				Content:   "Error: " + msg.Err.Error(),
				Timestamp: time.Now(),
			})
		} else if msg.Output != "" {
			m.messages = append(m.messages, StreamMessage{
				Role:      "system",
				Content:   msg.Output,
				Timestamp: time.Now(),
			})
		}
	}

	return m, tea.Batch(cmds...)
}

// updateInsertMode handles key events when in insert mode.
func (m StreamModel) updateInsertMode(msg tea.KeyMsg) (StreamModel, tea.Cmd) {
	key := msg.String()

	// Delegate to autocomplete when visible
	if m.autocomplete.IsVisible() {
		switch key {
		case "tab":
			m.autocomplete.Next()
			return m, nil
		case "shift+tab":
			m.autocomplete.Prev()
			return m, nil
		case "enter":
			name := m.autocomplete.Accept()
			if name != "" {
				m.inputValue = []rune("/" + name + " ")
				m.inputPos = len(m.inputValue)
			}
			return m, nil
		case "esc":
			m.autocomplete.Dismiss()
			return m, nil
		}
	}

	// Delegate to mention when visible
	if m.mention.IsVisible() {
		switch key {
		case "tab":
			m.mention.Next()
			return m, nil
		case "shift+tab":
			m.mention.Prev()
			return m, nil
		case "enter":
			slug := m.mention.Accept()
			if slug != "" {
				input := string(m.inputValue)
				atIdx := strings.LastIndex(input, "@")
				if atIdx >= 0 {
					m.inputValue = []rune(input[:atIdx] + slug + " ")
					m.inputPos = len(m.inputValue)
				}
			}
			return m, nil
		case "esc":
			m.mention.Dismiss()
			return m, nil
		}
	}

	switch key {
	case "enter":
		return m.handleSubmit()
	case "esc":
		m.mode = "normal"
		m.statusBar.Mode = "NORMAL"
		return m, nil
	case "backspace":
		if m.inputPos > 0 {
			m.inputValue = append(m.inputValue[:m.inputPos-1], m.inputValue[m.inputPos:]...)
			m.inputPos--
			m.updateInputOverlays()
		}
		return m, nil
	case "delete":
		if m.inputPos < len(m.inputValue) {
			m.inputValue = append(m.inputValue[:m.inputPos], m.inputValue[m.inputPos+1:]...)
			m.updateInputOverlays()
		}
		return m, nil
	case "left":
		if m.inputPos > 0 {
			m.inputPos--
		}
		return m, nil
	case "right":
		if m.inputPos < len(m.inputValue) {
			m.inputPos++
		}
		return m, nil
	case "home", "ctrl+a":
		m.inputPos = 0
		return m, nil
	case "end", "ctrl+e":
		m.inputPos = len(m.inputValue)
		return m, nil
	case "ctrl+u":
		m.inputValue = m.inputValue[m.inputPos:]
		m.inputPos = 0
		m.updateInputOverlays()
		return m, nil
	case "ctrl+k":
		m.inputValue = m.inputValue[:m.inputPos]
		m.updateInputOverlays()
		return m, nil
	case "tab", "shift+tab":
		return m, nil
	default:
		// Insert printable character
		runes := []rune(key)
		if len(runes) == 1 && runes[0] >= 32 {
			newInput := make([]rune, len(m.inputValue)+1)
			copy(newInput, m.inputValue[:m.inputPos])
			newInput[m.inputPos] = runes[0]
			copy(newInput[m.inputPos+1:], m.inputValue[m.inputPos:])
			m.inputValue = newInput
			m.inputPos++
			m.updateInputOverlays()
		}
		return m, nil
	}
}

// updateNormalMode handles key events when in normal mode.
func (m StreamModel) updateNormalMode(msg tea.KeyMsg) (StreamModel, tea.Cmd) {
	switch msg.String() {
	case "i":
		m.mode = "insert"
		m.statusBar.Mode = "INSERT"
	case "j":
		if m.scrollOffset > 0 {
			m.scrollOffset--
		}
	case "k":
		m.scrollOffset++
	case "G":
		m.scrollOffset = 0
	case "q":
		return m, tea.Quit
	}
	return m, nil
}

// handleSubmit processes the current input as a slash command or natural language message.
func (m StreamModel) handleSubmit() (StreamModel, tea.Cmd) {
	input := strings.TrimSpace(string(m.inputValue))
	if input == "" {
		return m, nil
	}

	m.inputValue = nil
	m.inputPos = 0
	m.autocomplete.Dismiss()
	m.mention.Dismiss()

	if strings.HasPrefix(input, "/") {
		return m.handleSlashCommand(input)
	}

	// Add as user message
	m.messages = append(m.messages, StreamMessage{
		Role:      "user",
		Content:   input,
		Timestamp: time.Now(),
	})

	// Route via message router
	available := m.availableAgents()
	result := m.messageRouter.Route(input, available)

	// Ensure primary agent exists
	primarySlug := result.Primary
	if _, ok := m.agentService.Get(primarySlug); !ok {
		if _, err := m.agentService.CreateFromTemplate(primarySlug, primarySlug); err != nil {
			primarySlug = "team-lead"
		} else {
			_ = m.agentService.Start(primarySlug)
		}
	}

	// Wire events + steer
	m.wireAgent(primarySlug)
	if ma, ok := m.agentService.Get(primarySlug); ok {
		m.messageRouter.RegisterAgent(primarySlug, ma.Config.Expertise)
	}
	_ = m.agentService.Steer(primarySlug, input)
	m.agentService.EnsureRunning(primarySlug)

	// Notify collaborators
	for _, collab := range result.Collaborators {
		if _, ok := m.agentService.Get(collab); !ok {
			if _, err := m.agentService.CreateFromTemplate(collab, collab); err == nil {
				_ = m.agentService.Start(collab)
			}
		}
		m.wireAgent(collab)
		_ = m.agentService.FollowUp(collab, input)
		m.agentService.EnsureRunning(collab)
	}

	m.messageRouter.RecordAgentActivity(primarySlug)

	m.loading = true
	m.spinner.SetActive(true)
	m.spinner.SetLabel("thinking...")
	m.updateRoster()

	return m, nil
}

// handleSlashCommand processes built-in slash commands.
func (m StreamModel) handleSlashCommand(input string) (StreamModel, tea.Cmd) {
	parts := strings.Fields(input)
	cmd := strings.TrimPrefix(parts[0], "/")

	switch cmd {
	case "help":
		help := "Available commands:\n" +
			"  /help   — Show this help\n" +
			"  /clear  — Clear chat history\n" +
			"  /quit   — Exit nex\n" +
			"  /q      — Exit nex"
		m.messages = append(m.messages, StreamMessage{
			Role:      "system",
			Content:   help,
			Timestamp: time.Now(),
		})
	case "clear":
		m.messages = []StreamMessage{{
			Role:      "system",
			Content:   "Chat cleared.",
			Timestamp: time.Now(),
		}}
		m.scrollOffset = 0
	case "quit", "q":
		return m, tea.Quit
	default:
		m.messages = append(m.messages, StreamMessage{
			Role:      "system",
			Content:   fmt.Sprintf("Unknown command: /%s", cmd),
			Timestamp: time.Now(),
		})
	}

	return m, nil
}

// View renders the two-column layout: messages+input on the left, roster on the right.
func (m StreamModel) View() string {
	if m.width == 0 || m.height == 0 {
		return "Loading..."
	}

	rw := rosterWidth + 4 // roster content + border padding
	lw := m.width - rw - 1
	showRoster := lw >= 30
	if !showRoster {
		lw = m.width
	}

	// Height budget: title(1) + messages(flex) + spinner?(1) + input(3) + statusbar(1)
	usedH := 5
	if m.loading {
		usedH++
	}
	msgH := m.height - usedH
	if msgH < 1 {
		msgH = 1
	}

	// Title
	title := TitleStyle.Render("nex v0.1.0")

	// Messages
	msgsView := m.renderMessages(lw, msgH)

	// Build left column
	var leftParts []string
	leftParts = append(leftParts, title, msgsView)
	if m.loading {
		leftParts = append(leftParts, m.spinner.View())
	}
	leftParts = append(leftParts, m.renderInput(lw))

	// Autocomplete / mention overlays
	if ac := m.autocomplete.View(); ac != "" {
		leftParts = append(leftParts, ac)
	}
	if mn := m.mention.View(); mn != "" {
		leftParts = append(leftParts, mn)
	}

	left := lipgloss.JoinVertical(lipgloss.Left, leftParts...)

	// Two-column layout
	var content string
	if showRoster {
		right := m.roster.View()
		content = lipgloss.JoinHorizontal(lipgloss.Top, left, " ", right)
	} else {
		content = left
	}

	// Status bar at bottom
	sb := m.statusBar
	sb.Width = m.width
	return content + "\n" + sb.View()
}

// renderMessages renders the scrollable message list.
func (m StreamModel) renderMessages(width, height int) string {
	if height <= 0 {
		return ""
	}

	var lines []string
	for _, msg := range m.messages {
		lines = append(lines, m.renderMessage(msg, width))
	}

	// Append streaming partial texts with cursor
	for slug, partial := range m.streaming {
		agentName := slug
		if ma, ok := m.agentService.Get(slug); ok {
			agentName = ma.Config.Name
		}
		dimStyle := lipgloss.NewStyle().Foreground(lipgloss.Color(MutedColor))
		lines = append(lines, m.agentPrefix(slug, agentName)+dimStyle.Render(partial+"_"))
	}

	total := len(lines)
	if total == 0 {
		return strings.Repeat("\n", height-1)
	}

	// Scroll: offset 0 = show latest, higher = scroll up
	end := total - m.scrollOffset
	if end > total {
		end = total
	}
	if end < 1 {
		end = 1
	}
	start := end - height
	if start < 0 {
		start = 0
	}

	visible := lines[start:end]
	result := strings.Join(visible, "\n")

	// Pad to fill height (push content to bottom)
	if len(visible) < height {
		result = strings.Repeat("\n", height-len(visible)) + result
	}

	return result
}

// renderMessage formats a single stream message by role.
func (m StreamModel) renderMessage(msg StreamMessage, width int) string {
	switch msg.Role {
	case "user":
		return UserStyle.Render("You: ") + msg.Content
	case "agent":
		return m.agentPrefix(msg.AgentSlug, msg.AgentName) + msg.Content
	case "system":
		return SystemStyle.Render("  " + msg.Content)
	default:
		return msg.Content
	}
}

// agentPrefix returns a styled name prefix based on the agent's role.
func (m StreamModel) agentPrefix(slug, name string) string {
	if slug == "team-lead" {
		style := lipgloss.NewStyle().
			Foreground(lipgloss.Color("#EAB308")).
			Bold(true)
		return style.Render(name+": ")
	}
	// Specialist agents: dim with "│ " prefix
	style := lipgloss.NewStyle().
		Foreground(lipgloss.Color(MutedColor))
	return style.Render("│ "+name+": ")
}

// renderInput renders the bordered text input area.
func (m StreamModel) renderInput(width int) string {
	var inputStr string

	if len(m.inputValue) == 0 {
		if m.mode == "insert" {
			inputStr = SystemStyle.Render("Type a message... (/help, /quit)")
		}
	} else if m.mode == "insert" {
		// Render with cursor
		before := string(m.inputValue[:m.inputPos])
		cursorStyle := lipgloss.NewStyle().Reverse(true)
		var cursor, after string
		if m.inputPos < len(m.inputValue) {
			cursor = cursorStyle.Render(string(m.inputValue[m.inputPos]))
			after = string(m.inputValue[m.inputPos+1:])
		} else {
			cursor = cursorStyle.Render(" ")
			after = ""
		}
		inputStr = before + cursor + after
	} else {
		inputStr = string(m.inputValue)
	}

	iw := width - 4
	if iw < 10 {
		iw = 10
	}
	return InputBorderStyle.Width(iw).Render(inputStr)
}

// wireAgent registers event handlers on an agent's loop to forward events to the TUI channel.
func (m StreamModel) wireAgent(slug string) {
	if m.wiredAgents[slug] {
		return
	}
	ma, ok := m.agentService.Get(slug)
	if !ok {
		return
	}

	ch := m.agentEvents
	ma.Loop.On(agent.EventMessage, func(args ...any) {
		if len(args) > 0 {
			if text, ok := args[0].(string); ok {
				select {
				case ch <- AgentTextMsg{AgentSlug: slug, Text: text}:
				default:
				}
			}
		}
	})
	ma.Loop.On(agent.EventDone, func(args ...any) {
		select {
		case ch <- AgentDoneMsg{AgentSlug: slug}:
		default:
		}
	})
	ma.Loop.On(agent.EventError, func(args ...any) {
		errStr := "unknown error"
		if len(args) > 0 {
			if s, ok := args[0].(string); ok {
				errStr = s
			}
		}
		select {
		case ch <- AgentErrorMsg{AgentSlug: slug, Err: fmt.Errorf("%s", errStr)}:
		default:
		}
	})
	ma.Loop.On(agent.EventPhaseChange, func(args ...any) {
		var from, to string
		if len(args) >= 2 {
			if f, ok := args[0].(agent.AgentPhase); ok {
				from = string(f)
			}
			if t, ok := args[1].(agent.AgentPhase); ok {
				to = string(t)
			}
		}
		select {
		case ch <- PhaseChangeMsg{AgentSlug: slug, From: from, To: to}:
		default:
		}
	})

	m.wiredAgents[slug] = true
}

// updateInputOverlays syncs autocomplete and mention state with current input.
func (m *StreamModel) updateInputOverlays() {
	input := string(m.inputValue)
	m.autocomplete.UpdateQuery(input)

	// Refresh mention agent list
	agents := m.agentService.List()
	mentions := make([]AgentMention, len(agents))
	for i, a := range agents {
		mentions[i] = AgentMention{Slug: a.Config.Slug, Name: a.Config.Name}
	}
	m.mention.UpdateAgents(mentions)
	m.mention.UpdateQuery(input)
}

// updateRoster syncs the roster display with agent service state.
func (m *StreamModel) updateRoster() {
	agents := m.agentService.List()
	entries := make([]AgentEntry, len(agents))
	for i, a := range agents {
		entries[i] = AgentEntry{
			Slug:  a.Config.Slug,
			Name:  a.Config.Name,
			Phase: string(a.State.Phase),
		}
	}
	m.roster.UpdateAgents(entries)
}

// availableAgents returns AgentInfo for all agents in the service.
func (m StreamModel) availableAgents() []orchestration.AgentInfo {
	agents := m.agentService.List()
	infos := make([]orchestration.AgentInfo, len(agents))
	for i, a := range agents {
		infos[i] = orchestration.AgentInfo{
			Slug:      a.Config.Slug,
			Expertise: a.Config.Expertise,
		}
	}
	return infos
}

// hasActiveAgents returns true if any agent is in an active (non-idle, non-done) phase.
func (m StreamModel) hasActiveAgents() bool {
	for _, a := range m.agentService.List() {
		state, ok := m.agentService.GetState(a.Config.Slug)
		if !ok {
			continue
		}
		switch state.Phase {
		case agent.PhaseBuildContext, agent.PhaseStreamLLM, agent.PhaseExecuteTool:
			return true
		}
	}
	return false
}

// waitForAgentEvent returns a tea.Cmd that blocks until the next agent event arrives.
func waitForAgentEvent(ch <-chan tea.Msg) tea.Cmd {
	return func() tea.Msg {
		msg, ok := <-ch
		if !ok {
			return nil
		}
		return msg
	}
}
