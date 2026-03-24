package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"

	"github.com/nex-ai/nex-cli/internal/api"
	"github.com/nex-ai/nex-cli/internal/config"
	"github.com/nex-ai/nex-cli/internal/team"
	"github.com/nex-ai/nex-cli/internal/tui"
)

type channelMsg struct {
	messages []brokerMessage
}

type channelMembersMsg struct {
	members []channelMember
}

type channelInterviewMsg struct {
	pending *channelInterview
}

type brokerMessage struct {
	ID        string   `json:"id"`
	From      string   `json:"from"`
	Content   string   `json:"content"`
	Tagged    []string `json:"tagged"`
	ReplyTo   string   `json:"reply_to"`
	Timestamp string   `json:"timestamp"`
}

type channelMember struct {
	Slug        string `json:"slug"`
	LastMessage string `json:"lastMessage"`
	LastTime    string `json:"lastTime"`
}

type channelInterviewOption struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

type channelInterview struct {
	ID            string                   `json:"id"`
	From          string                   `json:"from"`
	Question      string                   `json:"question"`
	Context       string                   `json:"context"`
	Options       []channelInterviewOption `json:"options"`
	RecommendedID string                   `json:"recommended_id"`
	CreatedAt     string                   `json:"created_at"`
}

type channelTickMsg time.Time
type channelPostDoneMsg struct{ err error }
type channelInterviewAnswerDoneMsg struct{ err error }
type channelResetDoneMsg struct{ err error }
type channelInitDoneMsg struct{ err error }
type channelIntegrationDoneMsg struct {
	label string
	url   string
	err   error
}

var mentionPattern = regexp.MustCompile(`@([A-Za-z0-9_-]+)`)

// brokerAuthToken reads the shared secret from the environment.
var brokerAuthToken = os.Getenv("NEX_BROKER_TOKEN")

// newBrokerRequest creates an HTTP request with the broker auth header.
func newBrokerRequest(method, url string, body io.Reader) (*http.Request, error) {
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return nil, err
	}
	if brokerAuthToken != "" {
		req.Header.Set("Authorization", "Bearer "+brokerAuthToken)
	}
	if method == http.MethodPost {
		req.Header.Set("Content-Type", "application/json")
	}
	return req, nil
}

var channelSlashCommands = []tui.SlashCommand{
	{Name: "init", Description: "Run setup"},
	{Name: "integrate", Description: "Connect an integration"},
	{Name: "reply", Description: "Reply in thread by message ID"},
	{Name: "expand", Description: "Expand a collapsed thread"},
	{Name: "collapse", Description: "Collapse a thread"},
	{Name: "cancel", Description: "Exit reply/setup mode"},
	{Name: "reset", Description: "Reset office state and agents"},
	{Name: "quit", Description: "Exit the office"},
}

type channelPickerMode string

const (
	channelPickerNone         channelPickerMode = ""
	channelPickerInitProvider channelPickerMode = "init_provider"
	channelPickerInitPack     channelPickerMode = "init_pack"
	channelPickerIntegrations channelPickerMode = "integrations"
)

type channelIntegrationSpec struct {
	Label       string
	Value       string
	Type        string
	Provider    string
	Description string
}

var channelIntegrationSpecs = []channelIntegrationSpec{
	{Label: "Gmail", Value: "gmail", Type: "email", Provider: "google", Description: "Connect Google email"},
	{Label: "Google Calendar", Value: "google-calendar", Type: "calendar", Provider: "google", Description: "Connect Google Calendar and the Nex Meeting Bot"},
	{Label: "Outlook", Value: "outlook", Type: "email", Provider: "microsoft", Description: "Connect Microsoft email"},
	{Label: "Outlook Calendar", Value: "outlook-calendar", Type: "calendar", Provider: "microsoft", Description: "Connect Outlook Calendar and the Nex Meeting Bot"},
	{Label: "Slack", Value: "slack", Type: "messaging", Provider: "slack", Description: "Connect Slack workspace messaging"},
	{Label: "Salesforce", Value: "salesforce", Type: "crm", Provider: "salesforce", Description: "Connect Salesforce CRM"},
	{Label: "HubSpot", Value: "hubspot", Type: "crm", Provider: "hubspot", Description: "Connect HubSpot CRM"},
	{Label: "Attio", Value: "attio", Type: "crm", Provider: "attio", Description: "Connect Attio CRM"},
}

// focusArea identifies which panel currently owns keyboard input.
type focusArea int

const (
	focusMain    focusArea = 0
	focusSidebar focusArea = 1
	focusThread  focusArea = 2
)

type channelModel struct {
	messages        []brokerMessage
	members         []channelMember
	pending         *channelInterview
	lastID          string
	replyToID       string
	expandedThreads map[string]bool
	autocomplete    tui.AutocompleteModel
	mention         tui.MentionModel
	input           []rune
	inputPos        int
	width           int
	height          int
	scroll          int
	posting         bool
	selectedOption  int
	notice          string
	initFlow        tui.InitFlowModel
	picker          tui.PickerModel
	pickerMode      channelPickerMode

	// 3-column layout state
	focus            focusArea
	sidebarCollapsed bool
	threadPanelOpen  bool
	threadPanelID    string
	threadInput      []rune
	threadInputPos   int
	threadScroll     int
}

func newChannelModel() channelModel {
	m := channelModel{
		expandedThreads: make(map[string]bool),
		autocomplete:    tui.NewAutocomplete(channelSlashCommands),
		mention:         tui.NewMention(channelMentionAgents(nil)),
		initFlow:        tui.NewInitFlow(),
	}
	if config.ResolveAPIKey("") == "" {
		m.notice = "No Nex API key configured. Starting setup..."
		m.initFlow, _ = m.initFlow.Start()
	}
	return m
}

func (m channelModel) Init() tea.Cmd {
	return tea.Batch(
		pollBroker(""),
		pollMembers(),
		pollInterview(),
		tickChannel(),
	)
}

func (m channelModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

	case tea.KeyMsg:
		// ── Global keys (always active) ───────────────────────────────
		switch msg.String() {
		case "ctrl+c":
			killTeamSession()
			return m, tea.Quit
		case "ctrl+b":
			m.sidebarCollapsed = !m.sidebarCollapsed
			return m, nil
		}

		// ── Esc: close overlays/thread, then cycle ────────────────────
		if msg.String() == "esc" {
			// Close overlays first
			if m.picker.IsActive() {
				m.picker.SetActive(false)
				if m.pickerMode == channelPickerIntegrations {
					m.notice = "Integration canceled."
				} else {
					m.initFlow = tui.NewInitFlow()
					m.notice = "Setup canceled."
				}
				m.pickerMode = channelPickerNone
				return m, nil
			}
			if m.autocomplete.IsVisible() || m.mention.IsVisible() {
				var cmd tea.Cmd
				m.autocomplete, cmd = m.autocomplete.Update(msg)
				_ = cmd
				m.mention, _ = m.mention.Update(msg)
				return m, nil
			}
			// Close thread panel
			if m.threadPanelOpen {
				m.threadPanelOpen = false
				m.threadPanelID = ""
				m.threadInput = nil
				m.threadInputPos = 0
				m.threadScroll = 0
				if m.focus == focusThread {
					m.focus = focusMain
				}
				return m, nil
			}
			return m, nil
		}

		// ── Tab: cycle focus 0→1→2→0 (only visible panels) ───────────
		if msg.String() == "tab" && !m.autocomplete.IsVisible() && !m.mention.IsVisible() && !m.picker.IsActive() {
			m.focus = m.nextFocus()
			return m, nil
		}

		// ── Route by focus area ───────────────────────────────────────
		if m.focus == focusThread && m.threadPanelOpen {
			return m.updateThread(msg)
		}
		if m.focus == focusSidebar && !m.sidebarCollapsed {
			return m.updateSidebar(msg)
		}

		// ── focusMain: existing behavior ──────────────────────────────
		if m.picker.IsActive() {
			var cmd tea.Cmd
			m.picker, cmd = m.picker.Update(msg)
			return m, cmd
		}
		if m.initFlow.Phase() == tui.InitAPIKey {
			var cmd tea.Cmd
			m.initFlow, cmd = m.initFlow.Update(msg)
			return m, cmd
		}
		if m.autocomplete.IsVisible() {
			switch msg.String() {
			case "tab":
				if name := m.autocomplete.Accept(); name != "" {
					m.input = []rune("/" + name + " ")
					m.inputPos = len(m.input)
					m.updateInputOverlays()
				}
				return m, nil
			case "enter":
				if name := m.autocomplete.Accept(); name != "" {
					m.input = []rune("/" + name)
					m.inputPos = len(m.input)
					m.updateInputOverlays()
					return m.Update(tea.KeyMsg{Type: tea.KeyEnter})
				}
			case "up", "down", "shift+tab":
				var cmd tea.Cmd
				m.autocomplete, cmd = m.autocomplete.Update(msg)
				_ = cmd
				return m, nil
			default:
				var cmd tea.Cmd
				m.autocomplete, cmd = m.autocomplete.Update(msg)
				_ = cmd
			}
		}
		if m.mention.IsVisible() {
			switch msg.String() {
			case "tab", "enter":
				if mention := m.mention.Accept(); mention != "" {
					input := string(m.input)
					atIdx := strings.LastIndex(input[:m.inputPos], "@")
					if atIdx >= 0 {
						m.input = []rune(input[:atIdx] + mention + " " + input[m.inputPos:])
						m.inputPos = atIdx + len([]rune(mention)) + 1
						m.updateInputOverlays()
					}
				}
				return m, nil
			case "up", "down", "shift+tab":
				var cmd tea.Cmd
				m.mention, cmd = m.mention.Update(msg)
				_ = cmd
				return m, nil
			default:
				var cmd tea.Cmd
				m.mention, cmd = m.mention.Update(msg)
				_ = cmd
			}
		}
		switch msg.String() {
		case "enter":
			if len(m.input) > 0 {
				text := string(m.input)
				trimmed := strings.TrimSpace(text)
				if trimmed == "/quit" || trimmed == "/exit" || trimmed == "/q" {
					killTeamSession()
					return m, tea.Quit
				}
				if trimmed == "/reset" {
					m.input = nil
					m.inputPos = 0
					m.notice = ""
					m.posting = true
					return m, resetTeamSession()
				}
				if trimmed == "/integrate" {
					m.input = nil
					m.inputPos = 0
					if config.ResolveAPIKey("") == "" {
						m.notice = "Run setup first. No Nex API key is configured."
						m.initFlow, _ = m.initFlow.Start()
						return m, nil
					}
					m.picker = tui.NewPicker("Choose Integration", channelIntegrationOptions())
					m.picker.SetActive(true)
					m.pickerMode = channelPickerIntegrations
					m.notice = "Choose an integration to connect."
					return m, nil
				}
				if trimmed == "/init" {
					m.input = nil
					m.inputPos = 0
					m.notice = "Starting setup..."
					var cmd tea.Cmd
					m.initFlow, cmd = m.initFlow.Start()
					return m, cmd
				}
				if trimmed == "/cancel" {
					m.input = nil
					m.inputPos = 0
					if m.replyToID != "" {
						m.replyToID = ""
						m.threadPanelOpen = false
						m.threadPanelID = ""
						m.threadInput = nil
						m.threadInputPos = 0
						m.threadScroll = 0
						if m.focus == focusThread {
							m.focus = focusMain
						}
						m.notice = "Reply mode cleared."
					} else if m.initFlow.IsActive() || m.initFlow.Phase() == tui.InitDone || m.picker.IsActive() {
						m.initFlow = tui.NewInitFlow()
						m.picker.SetActive(false)
						m.notice = "Setup canceled."
					} else {
						m.notice = "Nothing to cancel."
					}
					return m, nil
				}
				if strings.HasPrefix(trimmed, "/reply") {
					m.input = nil
					m.inputPos = 0
					target := strings.TrimSpace(strings.TrimPrefix(trimmed, "/reply"))
					if target == "" {
						m.notice = "Usage: /reply <message-id>"
						return m, nil
					}
					if _, ok := findMessageByID(m.messages, target); !ok {
						m.notice = fmt.Sprintf("Message %s not found.", target)
						return m, nil
					}
					m.replyToID = target
					m.threadPanelOpen = true
					m.threadPanelID = target
					m.threadInput = nil
					m.threadInputPos = 0
					m.threadScroll = 0
					m.notice = fmt.Sprintf("Replying in thread %s.", target)
					return m, nil
				}
				if strings.HasPrefix(trimmed, "/expand") {
					m.input = nil
					m.inputPos = 0
					target := strings.TrimSpace(strings.TrimPrefix(trimmed, "/expand"))
					if target == "" {
						m.notice = "Usage: /expand <message-id|all>"
						return m, nil
					}
					if target == "all" {
						for _, msg := range m.messages {
							if hasThreadReplies(m.messages, msg.ID) {
								m.expandedThreads[msg.ID] = true
							}
						}
						m.notice = "Expanded all threads."
						return m, nil
					}
					if _, ok := findMessageByID(m.messages, target); !ok {
						m.notice = fmt.Sprintf("Message %s not found.", target)
						return m, nil
					}
					m.expandedThreads[target] = true
					m.notice = fmt.Sprintf("Expanded thread %s.", target)
					return m, nil
				}
				if strings.HasPrefix(trimmed, "/collapse") {
					m.input = nil
					m.inputPos = 0
					target := strings.TrimSpace(strings.TrimPrefix(trimmed, "/collapse"))
					if target == "" {
						m.notice = "Usage: /collapse <message-id|all>"
						return m, nil
					}
					if target == "all" {
						m.expandedThreads = make(map[string]bool)
						m.notice = "Collapsed all threads."
						return m, nil
					}
					if _, ok := findMessageByID(m.messages, target); !ok {
						m.notice = fmt.Sprintf("Message %s not found.", target)
						return m, nil
					}
					delete(m.expandedThreads, target)
					m.notice = fmt.Sprintf("Collapsed thread %s.", target)
					return m, nil
				}

				m.input = nil
				m.inputPos = 0
				m.notice = ""

				m.posting = true
				if m.pending != nil {
					return m, postInterviewAnswer(*m.pending, "", "", text)
				}
				return m, postToChannel(text, m.replyToID)
			} else if m.pending != nil {
				opt := m.selectedInterviewOption()
				if opt != nil {
					m.posting = true
					return m, postInterviewAnswer(*m.pending, opt.ID, opt.Label, "")
				}
			}
		case "backspace":
			if m.inputPos > 0 {
				m.input = append(m.input[:m.inputPos-1], m.input[m.inputPos:]...)
				m.inputPos--
				m.updateInputOverlays()
			}
		case "ctrl+u":
			m.input = nil
			m.inputPos = 0
			m.updateInputOverlays()
		case "ctrl+a":
			m.inputPos = 0
		case "ctrl+e":
			m.inputPos = len(m.input)
		case "left":
			if m.inputPos > 0 {
				m.inputPos--
			}
		case "right":
			if m.inputPos < len(m.input) {
				m.inputPos++
			}
		case "up":
			if m.pending != nil && m.selectedOption > 0 {
				m.selectedOption--
			} else {
				m.scroll++
			}
		case "k":
			m.scroll++
		case "down":
			if m.pending != nil && m.selectedOption < m.interviewOptionCount()-1 {
				m.selectedOption++
			} else {
				m.scroll--
				if m.scroll < 0 {
					m.scroll = 0
				}
			}
		case "j":
			m.scroll--
			if m.scroll < 0 {
				m.scroll = 0
			}
		case "home":
			m.scroll = 1 << 30
		case "end":
			m.scroll = 0
		case "pgup":
			m.scroll += maxInt(10, m.height/2)
		case "pgdown":
			m.scroll -= maxInt(10, m.height/2)
			if m.scroll < 0 {
				m.scroll = 0
			}
		default:
			// Type character
			if msg.Type == tea.KeySpace {
				ch := []rune{' '}
				tail := make([]rune, len(m.input[m.inputPos:]))
				copy(tail, m.input[m.inputPos:])
				m.input = append(m.input[:m.inputPos], append(ch, tail...)...)
				m.inputPos++
				m.updateInputOverlays()
			} else if len(msg.String()) == 1 || msg.Type == tea.KeyRunes {
				ch := msg.Runes
				if len(ch) > 0 {
					tail := make([]rune, len(m.input[m.inputPos:]))
					copy(tail, m.input[m.inputPos:])
					m.input = append(m.input[:m.inputPos], append(ch, tail...)...)
					m.inputPos += len(ch)
					m.updateInputOverlays()
				}
			}
		}

	case channelPostDoneMsg:
		m.posting = false
		if msg.err != nil {
			m.notice = "Send failed: " + msg.err.Error()
		} else if m.replyToID != "" {
			m.notice = fmt.Sprintf("Reply sent to %s. Use /cancel to leave the thread.", m.replyToID)
		}

	case channelInterviewAnswerDoneMsg:
		m.posting = false
		if msg.err != nil {
			m.notice = "Interview answer failed: " + msg.err.Error()
		} else {
			m.pending = nil
			m.input = nil
			m.inputPos = 0
		}

	case channelResetDoneMsg:
		m.posting = false
		if msg.err == nil {
			m.messages = nil
			m.members = nil
			m.pending = nil
			m.lastID = ""
			m.replyToID = ""
			m.expandedThreads = make(map[string]bool)
			m.input = nil
			m.inputPos = 0
			m.scroll = 0
			m.notice = ""
			m.initFlow = tui.NewInitFlow()
			m.picker.SetActive(false)
			m.threadPanelOpen = false
			m.threadPanelID = ""
			m.threadInput = nil
			m.threadInputPos = 0
			m.threadScroll = 0
			m.focus = focusMain
			m.pickerMode = channelPickerNone
		} else {
			m.notice = "Reset failed: " + msg.err.Error()
		}

	case channelInitDoneMsg:
		m.posting = false
		if msg.err != nil {
			m.notice = "Setup failed: " + msg.err.Error()
		} else {
			m.notice = "Setup applied. Team reloaded with the new configuration."
		}
		m.initFlow = tui.NewInitFlow()
		m.picker.SetActive(false)
		m.pickerMode = channelPickerNone

	case channelIntegrationDoneMsg:
		m.posting = false
		m.picker.SetActive(false)
		m.pickerMode = channelPickerNone
		if msg.err != nil {
			m.notice = "Integration failed: " + msg.err.Error()
		} else if msg.url != "" {
			m.notice = fmt.Sprintf("%s connected. Browser opened at %s", msg.label, msg.url)
		} else {
			m.notice = fmt.Sprintf("%s connected.", msg.label)
		}

	case channelMsg:
		if len(msg.messages) > 0 {
			if m.scroll > 0 {
				m.scroll += len(msg.messages)
			}
			m.messages = append(m.messages, msg.messages...)
			m.lastID = msg.messages[len(msg.messages)-1].ID
		}

	case channelMembersMsg:
		m.members = msg.members
		m.updateInputOverlays()

	case tui.PickerSelectMsg:
		switch m.pickerMode {
		case channelPickerIntegrations:
			spec, ok := findChannelIntegration(msg.Value)
			m.picker.SetActive(false)
			m.pickerMode = channelPickerNone
			if !ok {
				m.notice = "Unknown integration selection."
				return m, nil
			}
			m.posting = true
			m.notice = fmt.Sprintf("Opening %s OAuth flow in your browser...", spec.Label)
			return m, connectIntegration(spec)
		default:
			m.picker.SetActive(false)
			var cmd tea.Cmd
			m.initFlow, cmd = m.initFlow.Update(msg)
			return m, cmd
		}

	case tui.InitFlowMsg:
		var cmd tea.Cmd
		m.initFlow, cmd = m.initFlow.Update(msg)
		switch m.initFlow.Phase() {
		case tui.InitProviderChoice:
			m.picker = tui.NewPicker("Choose LLM Provider", tui.ProviderOptions())
			m.picker.SetActive(true)
			m.pickerMode = channelPickerInitProvider
		case tui.InitPackChoice:
			m.picker = tui.NewPicker("Choose Agent Pack", tui.PackOptions())
			m.picker.SetActive(true)
			m.pickerMode = channelPickerInitPack
		case tui.InitDone:
			m.posting = true
			return m, tea.Batch(cmd, reconfigureTeamAgents())
		}
		return m, cmd

	case channelInterviewMsg:
		prevID := ""
		if m.pending != nil {
			prevID = m.pending.ID
		}
		m.pending = msg.pending
		if m.pending != nil && m.pending.ID != prevID {
			m.selectedOption = m.recommendedOptionIndex()
			m.input = nil
			m.inputPos = 0
		}

	case channelTickMsg:
		return m, tea.Batch(
			pollBroker(m.lastID),
			pollMembers(),
			pollInterview(),
			tickChannel(),
		)
	}

	return m, nil
}

func (m channelModel) View() string {
	if m.width == 0 {
		return "Loading..."
	}

	// Styles
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#F8FAFC"))

	agentColors := map[string]string{
		"ceo": "#EAB308", "pm": "#22C55E", "fe": "#3B82F6",
		"be": "#8B5CF6", "ai": "#14B8A6", "designer": "#EC4899", "cmo": "#F97316",
		"cro": "#06B6D4", "you": "#FFFFFF",
	}

	mutedStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#94A3B8"))
	statusStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#CBD5E1")).Italic(true)
	headerStyle := lipgloss.NewStyle().
		Background(lipgloss.Color("#0F172A")).
		Foreground(lipgloss.Color("#E2E8F0")).
		Padding(0, 1)
	headerMetaStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#94A3B8"))
	pillBase := lipgloss.NewStyle().
		Padding(0, 1).
		Foreground(lipgloss.Color("#E5E7EB")).
		Background(lipgloss.Color("#1E293B"))

	var memberPills []string
	for i, member := range m.members {
		if i >= 5 {
			break
		}
		color := agentColors[member.Slug]
		if color == "" {
			color = "#64748B"
		}
		label := displayName(member.Slug)
		mood := inferMood(member.LastMessage)
		if mood != "" {
			label += " · " + mood
		}
		memberPills = append(memberPills, pillBase.Copy().
			Foreground(lipgloss.Color(color)).
			Background(lipgloss.Color("#111827")).
			BorderForeground(lipgloss.Color(color)).
			Render(label))
	}
	if len(m.members) > 5 {
		memberPills = append(memberPills, pillBase.Render(fmt.Sprintf("+%d", len(m.members)-5)))
	}
	headerLine1 := lipgloss.JoinHorizontal(lipgloss.Top,
		titleStyle.Render("The Nex Office"),
		"  ",
		headerMetaStyle.Render("Founding Team channel"),
	)
	headerLine2 := headerMetaStyle.Render("Shared office chat. CEO decides, teammates debate, and the office state persists.")
	if len(memberPills) > 0 {
		headerLine2 = lipgloss.JoinHorizontal(lipgloss.Top, headerLine2, "   ", strings.Join(memberPills, " "))
	}
	if m.pending != nil {
		headerLine2 = lipgloss.JoinHorizontal(lipgloss.Top, headerLine2, "   ",
			lipgloss.NewStyle().Foreground(lipgloss.Color("#FBBF24")).Bold(true).Render("Interview mode: team paused"))
	}
	titleBar := headerStyle.Width(m.width).Render(headerLine1 + "\n" + headerLine2)

	// Input field
	inputWidth := m.width - 4
	if inputWidth < 20 {
		inputWidth = 20
	}

	var inputStr string
	if len(m.input) == 0 {
		cursorStyle := lipgloss.NewStyle().Reverse(true)
		placeholder := " Type a message to the team... (/init, /reply, /expand, /collapse, /reset, /quit)"
		if config.ResolveAPIKey("") != "" {
			placeholder = " Type a message to the team... (/integrate, /reply, /expand, /collapse, /reset, /quit)"
		}
		if m.pending != nil {
			placeholder = " Type a custom answer, or press Enter to accept the selected option"
		} else if m.replyToID != "" {
			placeholder = fmt.Sprintf(" Replying in thread %s... (/cancel to go back to main channel)", m.replyToID)
		}
		inputStr = cursorStyle.Render(" ") + mutedStyle.Render(placeholder)
	} else {
		before := string(m.input[:m.inputPos])
		cursorStyle := lipgloss.NewStyle().Reverse(true)
		var cursor, after string
		if m.inputPos < len(m.input) {
			cursor = cursorStyle.Render(string(m.input[m.inputPos]))
			after = string(m.input[m.inputPos+1:])
		} else {
			cursor = cursorStyle.Render(" ")
			after = ""
		}
		inputStr = before + cursor + after
	}

	inputBorder := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#2563EB")).
		Foreground(lipgloss.Color("#F8FAFC")).
		Width(inputWidth).
		Padding(0, 1)
	inputBox := inputBorder.Render(inputStr)
	composerLabel := "Message #office"
	if m.pending != nil {
		composerLabel = fmt.Sprintf("Answer @%s's question", m.pending.From)
	} else if m.replyToID != "" {
		if parent, ok := findMessageByID(m.messages, m.replyToID); ok {
			composerLabel = fmt.Sprintf("Reply in thread %s · @%s", m.replyToID, parent.From)
		} else {
			composerLabel = fmt.Sprintf("Reply in thread %s", m.replyToID)
		}
	}
	composerTitle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#93C5FD")).
		Bold(true).
		Render(composerLabel)
	initPanel := ""
	if m.picker.IsActive() {
		initPanel = "\n" + m.picker.View()
	} else if m.initFlow.IsActive() || m.initFlow.Phase() == tui.InitDone {
		initPanel = "\n" + m.initFlow.View()
	}
	overlayPanel := ""
	if ac := m.autocomplete.View(); ac != "" {
		overlayPanel += "\n" + ac
	}
	if mn := m.mention.View(); mn != "" {
		overlayPanel += "\n" + mn
	}

	// Messages
	var lines []string
	contentWidth := inputWidth - 2
	if contentWidth < 32 {
		contentWidth = 32
	}
	if len(m.messages) == 0 {
		lines = append(lines, "")
		lines = append(lines, mutedStyle.Render("  Welcome to the channel. The right-side panes are your live teammates."))
		lines = append(lines, mutedStyle.Render("  Drop a company-building thought here and they should self-select into the conversation."))
		lines = append(lines, "")
		lines = append(lines, mutedStyle.Render("  Suggested prompt: Let's build an AI notetaking app company for busy professionals."))
	} else {
		lines = append(lines, renderDateSeparator(contentWidth, "Today"))
		for _, tm := range flattenThreadMessages(m.messages, m.expandedThreads) {
			msg := tm.Message
			ts := msg.Timestamp
			if len(ts) > 19 {
				ts = ts[11:19]
			}

			color := agentColors[msg.From]
			if color == "" {
				color = "#9CA3AF"
			}
			nameStyle := lipgloss.NewStyle().
				Foreground(lipgloss.Color(color)).
				Bold(true)
			ruleStyle := lipgloss.NewStyle().Foreground(lipgloss.Color(color))

			if strings.HasPrefix(msg.Content, "[STATUS]") {
				status := strings.TrimPrefix(msg.Content, "[STATUS] ")
				statusPrefix := "  " + strings.Repeat("  ", tm.Depth)
				if tm.Depth > 0 {
					statusPrefix += "↳ "
				}
				lines = appendWrapped(lines, contentWidth, fmt.Sprintf("%s%s  %s %s",
					statusPrefix,
					mutedStyle.Render(ts),
					nameStyle.Render("@"+msg.From),
					statusStyle.Render("is "+status),
				))
			} else {
				mood := inferMood(msg.Content)
				meta := roleLabel(msg.From) + " · " + msg.ID
				if mood != "" {
					meta += " · " + mood
				}
				if tm.Depth > 0 {
					meta += fmt.Sprintf(" · thread reply to %s", tm.ParentLabel)
				}
				metaStyle := mutedStyle
				if mood != "" {
					metaStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(color))
				}
				lines = append(lines, "")
				headerPrefix := "  " + strings.Repeat("  ", tm.Depth)
				if tm.Depth > 0 {
					headerPrefix += "↳ "
				}
				lines = appendWrapped(lines, contentWidth,
					fmt.Sprintf("%s%s  %s  %s", headerPrefix, nameStyle.Render(displayName(msg.From)), mutedStyle.Render(ts), metaStyle.Render(meta)),
				)

				prefix := "  " + strings.Repeat("  ", tm.Depth)
				if tm.Depth > 0 {
					prefix += ruleStyle.Render("┆") + " "
				} else {
					prefix += ruleStyle.Render("│") + " "
				}

				// Check for A2UI JSON blocks and render them as visual components
				textPart, a2uiRendered := renderA2UIBlocks(msg.Content, contentWidth-4)

				for _, paragraph := range strings.Split(textPart, "\n") {
					paragraph = highlightMentions(paragraph, agentColors)
					lines = appendWrapped(lines, contentWidth, prefix+paragraph)
				}
				if a2uiRendered != "" {
					for _, renderedLine := range strings.Split(a2uiRendered, "\n") {
						lines = append(lines, prefix+renderedLine)
					}
				}
				if tm.Collapsed && tm.HiddenReplies > 0 {
					participants := ""
					if len(tm.ThreadParticipants) > 0 {
						participants = " · " + strings.Join(tm.ThreadParticipants, ", ")
					}
					lines = appendWrapped(lines, contentWidth, "  "+mutedStyle.Render(
						fmt.Sprintf("… %d hidden repl%s in thread%s (/expand %s)",
							tm.HiddenReplies,
							pluralSuffix(tm.HiddenReplies),
							participants,
							msg.ID,
						),
					))
				}
			}
		}
	}
	interviewCard := ""
	if m.pending != nil {
		interviewCard = renderInterviewCard(*m.pending, m.selectedOption, inputWidth)
	}

	fixedHeight := lipgloss.Height(titleBar) +
		lipgloss.Height(interviewCard) +
		lipgloss.Height(initPanel) +
		lipgloss.Height(composerTitle) +
		lipgloss.Height(inputBox) +
		lipgloss.Height(overlayPanel) + 7
	viewHeight := m.height - fixedHeight
	if viewHeight < 1 {
		viewHeight = 1
	}

	// Scroll
	total := len(lines)
	scroll := clampScroll(total, viewHeight, m.scroll)
	end := total - scroll
	if end > total {
		end = total
	}
	if end < 1 && total > 0 {
		end = 1
	}
	start := end - viewHeight
	if start < 0 {
		start = 0
	}

	var visible []string
	if total > 0 {
		visible = lines[start:end]
	}
	for len(visible) < viewHeight {
		visible = append(visible, "")
	}
	bodyStyle := lipgloss.NewStyle().
		Border(lipgloss.NormalBorder()).
		BorderForeground(lipgloss.Color("#1E293B")).
		Padding(0, 1).
		Width(inputWidth)
	body := bodyStyle.Render(strings.Join(visible, "\n"))

	// Status bar
	agentCount := countUniqueAgents(m.messages)
	scrollHint := "PgUp/PgDn scroll"
	if scroll > 0 {
		scrollHint = fmt.Sprintf("scroll +%d", scroll)
	}
	statusBar := mutedStyle.Render(fmt.Sprintf(
		" %d messages │ %d agents active │ %s │ Ctrl+B {/}=swap pane │ Ctrl+B z=zoom pane",
		len(m.messages), agentCount, scrollHint,
	))
	if m.pending != nil {
		statusBar = lipgloss.NewStyle().Foreground(lipgloss.Color("#FBBF24")).Render(
			" Interview pending │ team paused until you answer │ ↑/↓ choose option │ Enter submit",
		)
	} else if m.notice != "" {
		statusBar = lipgloss.NewStyle().Foreground(lipgloss.Color("#93C5FD")).Render(" " + m.notice)
	} else if m.replyToID != "" {
		statusBar = lipgloss.NewStyle().Foreground(lipgloss.Color("#93C5FD")).Render(
			fmt.Sprintf(" Reply mode │ thread %s │ /cancel to return to main channel", m.replyToID),
		)
	}

	return titleBar + "\n" +
		body + "\n" +
		interviewCard +
		initPanel +
		composerTitle + "\n" +
		inputBox + "\n" +
		overlayPanel +
		statusBar
}

func (m channelModel) recommendedOptionIndex() int {
	if m.pending == nil {
		return 0
	}
	for i, option := range m.pending.Options {
		if option.ID == m.pending.RecommendedID {
			return i
		}
	}
	return 0
}

func (m channelModel) interviewOptionCount() int {
	if m.pending == nil {
		return 0
	}
	return len(m.pending.Options) + 1
}

func (m channelModel) selectedInterviewOption() *channelInterviewOption {
	if m.pending == nil {
		return nil
	}
	if len(m.pending.Options) == 0 {
		return nil
	}
	if m.selectedOption < 0 {
		return &m.pending.Options[0]
	}
	if m.selectedOption >= len(m.pending.Options) {
		return nil
	}
	return &m.pending.Options[m.selectedOption]
}

func countUniqueAgents(messages []brokerMessage) int {
	seen := make(map[string]bool)
	for _, m := range messages {
		if m.From == "you" {
			continue
		}
		seen[m.From] = true
	}
	return len(seen)
}

func appendWrapped(lines []string, width int, text string) []string {
	if width <= 0 {
		return append(lines, strings.Split(text, "\n")...)
	}
	wrapped := ansi.Wrap(text, width, "")
	return append(lines, strings.Split(wrapped, "\n")...)
}

type threadedMessage struct {
	Message            brokerMessage
	Depth              int
	ParentLabel        string
	Collapsed          bool
	HiddenReplies      int
	ThreadParticipants []string
}

func flattenThreadMessages(messages []brokerMessage, expanded map[string]bool) []threadedMessage {
	if len(messages) == 0 {
		return nil
	}
	byID := make(map[string]brokerMessage, len(messages))
	children := make(map[string][]brokerMessage)
	var roots []brokerMessage

	for _, msg := range messages {
		byID[msg.ID] = msg
	}
	for _, msg := range messages {
		if msg.ReplyTo != "" {
			if _, ok := byID[msg.ReplyTo]; ok {
				children[msg.ReplyTo] = append(children[msg.ReplyTo], msg)
				continue
			}
		}
		roots = append(roots, msg)
	}

	var out []threadedMessage
	var walk func(msg brokerMessage, depth int)
	walk = func(msg brokerMessage, depth int) {
		parentLabel := ""
		if msg.ReplyTo != "" {
			parentLabel = msg.ReplyTo
			if parent, ok := byID[msg.ReplyTo]; ok {
				parentLabel = "@" + parent.From
			}
		}
		tm := threadedMessage{
			Message:     msg,
			Depth:       depth,
			ParentLabel: parentLabel,
		}
		if len(children[msg.ID]) > 0 && !expanded[msg.ID] {
			tm.Collapsed = true
			tm.HiddenReplies = countThreadReplies(children, msg.ID)
			tm.ThreadParticipants = threadParticipants(children, msg.ID)
		}
		out = append(out, tm)
		if tm.Collapsed {
			return
		}
		for _, child := range children[msg.ID] {
			walk(child, depth+1)
		}
	}

	for _, root := range roots {
		walk(root, 0)
	}
	return out
}

func countThreadReplies(children map[string][]brokerMessage, rootID string) int {
	count := 0
	for _, child := range children[rootID] {
		count++
		count += countThreadReplies(children, child.ID)
	}
	return count
}

func threadParticipants(children map[string][]brokerMessage, rootID string) []string {
	seen := make(map[string]bool)
	var participants []string
	var walk func(id string)
	walk = func(id string) {
		for _, child := range children[id] {
			name := displayName(child.From)
			if !seen[name] {
				seen[name] = true
				participants = append(participants, name)
			}
			walk(child.ID)
		}
	}
	walk(rootID)
	return participants
}

func findMessageByID(messages []brokerMessage, id string) (brokerMessage, bool) {
	for _, msg := range messages {
		if msg.ID == id {
			return msg, true
		}
	}
	return brokerMessage{}, false
}

func hasThreadReplies(messages []brokerMessage, id string) bool {
	for _, msg := range messages {
		if msg.ReplyTo == id {
			return true
		}
	}
	return false
}

func pluralSuffix(n int) string {
	if n == 1 {
		return "y"
	}
	return "ies"
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func clampScroll(total, viewHeight, scroll int) int {
	if scroll < 0 {
		return 0
	}
	maxScroll := total - viewHeight
	if maxScroll < 0 {
		maxScroll = 0
	}
	if scroll > maxScroll {
		return maxScroll
	}
	return scroll
}

func displayName(slug string) string {
	switch slug {
	case "ceo":
		return "CEO"
	case "pm":
		return "Product Manager"
	case "fe":
		return "Frontend Engineer"
	case "be":
		return "Backend Engineer"
	case "ai":
		return "AI Engineer"
	case "designer":
		return "Designer"
	case "cmo":
		return "CMO"
	case "cro":
		return "CRO"
	case "you":
		return "You"
	default:
		return "@" + slug
	}
}

func roleLabel(slug string) string {
	switch slug {
	case "ceo":
		return "strategy"
	case "pm":
		return "product"
	case "fe":
		return "frontend"
	case "be":
		return "backend"
	case "ai":
		return "ai"
	case "designer":
		return "design"
	case "cmo":
		return "marketing"
	case "cro":
		return "revenue"
	case "you":
		return "human"
	default:
		return "teammate"
	}
}

func renderDateSeparator(width int, label string) string {
	lineWidth := width - len(label) - 8
	if lineWidth < 4 {
		lineWidth = 4
	}
	segment := strings.Repeat("─", lineWidth/2)
	return lipgloss.NewStyle().
		Foreground(lipgloss.Color("#64748B")).
		Render(fmt.Sprintf("%s  %s  %s", segment, label, segment))
}

func inferMood(text string) string {
	lower := strings.ToLower(text)
	switch {
	case lower == "":
		return ""
	case strings.Contains(lower, "love this") || strings.Contains(lower, "excited") || strings.Contains(lower, "let's go") || strings.Contains(lower, "great wedge"):
		return "energized"
	case strings.Contains(lower, "hmm") || strings.Contains(lower, "skept") || strings.Contains(lower, "push back") || strings.Contains(lower, "bloodbath") || strings.Contains(lower, "crowded"):
		return "skeptical"
	case strings.Contains(lower, "worr") || strings.Contains(lower, "risk") || strings.Contains(lower, "concern"):
		return "concerned"
	case strings.Contains(lower, "blocked") || strings.Contains(lower, "stuck") || strings.Contains(lower, "hard part"):
		return "tense"
	case strings.Contains(lower, "done") || strings.Contains(lower, "shipped") || strings.Contains(lower, "works"):
		return "relieved"
	case strings.Contains(lower, "need") || strings.Contains(lower, "should") || strings.Contains(lower, "must") || strings.Contains(lower, "v1"):
		return "focused"
	default:
		return ""
	}
}

func renderInterviewCard(interview channelInterview, selected int, width int) string {
	cardWidth := width
	if cardWidth < 40 {
		cardWidth = 40
	}
	labelStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#FBBF24")).Bold(true)
	titleStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#F8FAFC")).Bold(true)
	textStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#E2E8F0"))
	muted := lipgloss.NewStyle().Foreground(lipgloss.Color("#94A3B8"))

	lines := []string{
		labelStyle.Render("Human Interview"),
		titleStyle.Render(fmt.Sprintf("@%s needs your decision", interview.From)),
		"",
		textStyle.Width(cardWidth - 4).Render(interview.Question),
	}
	if strings.TrimSpace(interview.Context) != "" {
		lines = append(lines, "")
		lines = append(lines, muted.Width(cardWidth-4).Render(interview.Context))
	}
	lines = append(lines, "", muted.Render("Options"))
	for i, option := range interview.Options {
		prefix := "  "
		if i == selected {
			prefix = lipgloss.NewStyle().Foreground(lipgloss.Color("#60A5FA")).Bold(true).Render("→ ")
		}
		label := option.Label
		if option.ID == interview.RecommendedID {
			label += " (Recommended)"
		}
		lines = append(lines, prefix+titleStyle.Render(label))
		if strings.TrimSpace(option.Description) != "" {
			lines = append(lines, "    "+muted.Width(cardWidth-8).Render(option.Description))
		}
	}
	customPrefix := "  "
	if selected >= len(interview.Options) {
		customPrefix = lipgloss.NewStyle().Foreground(lipgloss.Color("#60A5FA")).Bold(true).Render("→ ")
	}
	lines = append(lines, customPrefix+titleStyle.Render("Custom answer"))
	lines = append(lines, "    "+muted.Width(cardWidth-8).Render("Type your own answer in the composer below."))
	lines = append(lines, "", muted.Render("Press Enter to accept the selected option, or type your own answer below."))
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#F59E0B")).
		Padding(0, 1).
		Width(cardWidth).
		Render(strings.Join(lines, "\n")) + "\n"
}

func highlightMentions(text string, agentColors map[string]string) string {
	return mentionPattern.ReplaceAllStringFunc(text, func(match string) string {
		slug := strings.TrimPrefix(strings.ToLower(match), "@")
		color := agentColors[slug]
		if color == "" {
			return match
		}
		return lipgloss.NewStyle().
			Foreground(lipgloss.Color(color)).
			Bold(true).
			Render(match)
	})
}

func postToChannel(text string, replyTo string) tea.Cmd {
	return func() tea.Msg {
		body, _ := json.Marshal(map[string]any{
			"from":     "you",
			"content":  text,
			"tagged":   extractTagsFromText(text),
			"reply_to": strings.TrimSpace(replyTo),
		})
		req, err := newBrokerRequest(http.MethodPost, "http://127.0.0.1:7890/messages", bytes.NewReader(body))
		if err != nil {
			return channelPostDoneMsg{err: err}
		}
		client := &http.Client{Timeout: 2 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return channelPostDoneMsg{err: err}
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			body, _ := io.ReadAll(resp.Body)
			if len(body) == 0 {
				return channelPostDoneMsg{err: fmt.Errorf("broker returned %s", resp.Status)}
			}
			return channelPostDoneMsg{err: fmt.Errorf("%s", strings.TrimSpace(string(body)))}
		}
		return channelPostDoneMsg{}
	}
}

func channelMentionAgents(members []channelMember) []tui.AgentMention {
	defaults := []tui.AgentMention{
		{Slug: "ceo", Name: "CEO"},
		{Slug: "pm", Name: "Product Manager"},
		{Slug: "fe", Name: "Frontend Engineer"},
		{Slug: "be", Name: "Backend Engineer"},
		{Slug: "ai", Name: "AI Engineer"},
		{Slug: "designer", Name: "Designer"},
		{Slug: "cmo", Name: "CMO"},
		{Slug: "cro", Name: "CRO"},
	}
	seen := make(map[string]bool, len(defaults))
	mentions := make([]tui.AgentMention, 0, len(defaults)+len(members))
	for _, ag := range defaults {
		seen[ag.Slug] = true
		mentions = append(mentions, ag)
	}
	for _, member := range members {
		if seen[member.Slug] {
			continue
		}
		seen[member.Slug] = true
		mentions = append(mentions, tui.AgentMention{Slug: member.Slug, Name: displayName(member.Slug)})
	}
	return mentions
}

func (m *channelModel) updateInputOverlays() {
	input := string(m.input)
	m.autocomplete.UpdateQuery(input)
	m.mention.UpdateAgents(channelMentionAgents(m.members))
	m.mention.UpdateQuery(input[:m.inputPos])
}

func extractTagsFromText(text string) []string {
	var tags []string
	for _, word := range strings.Fields(text) {
		if strings.HasPrefix(word, "@") && len(word) > 1 {
			tag := strings.TrimRight(word[1:], ".,!?;:")
			tags = append(tags, tag)
		}
	}
	return tags
}

func pollBroker(sinceID string) tea.Cmd {
	return func() tea.Msg {
		url := "http://127.0.0.1:7890/messages?limit=100"
		if sinceID != "" {
			url += "&since_id=" + sinceID
		}
		req, err := newBrokerRequest(http.MethodGet, url, nil)
		if err != nil {
			return channelMsg{}
		}
		client := &http.Client{Timeout: 2 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return channelMsg{}
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return channelMsg{}
		}

		var result struct {
			Messages []brokerMessage `json:"messages"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			return channelMsg{}
		}
		return channelMsg{messages: result.Messages}
	}
}

func pollMembers() tea.Cmd {
	return func() tea.Msg {
		req, err := newBrokerRequest(http.MethodGet, "http://127.0.0.1:7890/members", nil)
		if err != nil {
			return channelMembersMsg{}
		}
		client := &http.Client{Timeout: 2 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return channelMembersMsg{}
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return channelMembersMsg{}
		}

		var result struct {
			Members []channelMember `json:"members"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			return channelMembersMsg{}
		}
		return channelMembersMsg{members: result.Members}
	}
}

func pollInterview() tea.Cmd {
	return func() tea.Msg {
		req, err := newBrokerRequest(http.MethodGet, "http://127.0.0.1:7890/interview", nil)
		if err != nil {
			return channelInterviewMsg{}
		}
		client := &http.Client{Timeout: 2 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return channelInterviewMsg{}
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return channelInterviewMsg{}
		}

		var result struct {
			Pending *channelInterview `json:"pending"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			return channelInterviewMsg{}
		}
		return channelInterviewMsg{pending: result.Pending}
	}
}

func postInterviewAnswer(interview channelInterview, choiceID, choiceText, customText string) tea.Cmd {
	return func() tea.Msg {
		body, _ := json.Marshal(map[string]any{
			"id":          interview.ID,
			"choice_id":   choiceID,
			"choice_text": choiceText,
			"custom_text": customText,
		})
		req, err := newBrokerRequest(http.MethodPost, "http://127.0.0.1:7890/interview/answer", bytes.NewReader(body))
		if err != nil {
			return channelInterviewAnswerDoneMsg{err: err}
		}
		client := &http.Client{Timeout: 2 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return channelInterviewAnswerDoneMsg{err: err}
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			body, _ := io.ReadAll(resp.Body)
			if len(body) == 0 {
				return channelInterviewAnswerDoneMsg{err: fmt.Errorf("broker returned %s", resp.Status)}
			}
			return channelInterviewAnswerDoneMsg{err: fmt.Errorf("%s", strings.TrimSpace(string(body)))}
		}
		return channelInterviewAnswerDoneMsg{}
	}
}

func channelIntegrationOptions() []tui.PickerOption {
	options := make([]tui.PickerOption, 0, len(channelIntegrationSpecs))
	for _, spec := range channelIntegrationSpecs {
		options = append(options, tui.PickerOption{
			Label:       spec.Label,
			Value:       spec.Value,
			Description: spec.Description,
		})
	}
	return options
}

func findChannelIntegration(value string) (channelIntegrationSpec, bool) {
	for _, spec := range channelIntegrationSpecs {
		if spec.Value == value {
			return spec, true
		}
	}
	return channelIntegrationSpec{}, false
}

func connectIntegration(spec channelIntegrationSpec) tea.Cmd {
	return func() tea.Msg {
		apiKey := config.ResolveAPIKey("")
		if apiKey == "" {
			return channelIntegrationDoneMsg{err: errors.New("run /init first to configure your Nex API key")}
		}
		client := api.NewClient(apiKey)
		result, err := api.Post[map[string]any](client,
			fmt.Sprintf("/v1/integrations/%s/%s/connect", spec.Type, spec.Provider),
			nil,
			30*time.Second,
		)
		if err != nil {
			return channelIntegrationDoneMsg{err: err}
		}

		authURL := mapString(result, "auth_url")
		if authURL != "" {
			_ = openBrowserURL(authURL)
		}
		connectID := mapString(result, "connect_id")
		if connectID == "" {
			return channelIntegrationDoneMsg{label: spec.Label, url: authURL}
		}

		deadline := time.Now().Add(5 * time.Minute)
		for time.Now().Before(deadline) {
			time.Sleep(3 * time.Second)
			statusResp, err := api.Get[map[string]any](client,
				fmt.Sprintf("/v1/integrations/connect/%s/status", connectID),
				15*time.Second,
			)
			if err != nil {
				if _, ok := err.(*api.AuthError); ok {
					return channelIntegrationDoneMsg{err: err}
				}
				continue
			}
			status := strings.ToLower(mapString(statusResp, "status"))
			switch status {
			case "connected", "complete", "completed", "active":
				return channelIntegrationDoneMsg{label: spec.Label, url: authURL}
			case "failed", "error":
				reason := mapString(statusResp, "error")
				if reason == "" {
					reason = status
				}
				return channelIntegrationDoneMsg{err: fmt.Errorf("%s connection failed: %s", spec.Label, reason)}
			}
		}

		if authURL != "" {
			return channelIntegrationDoneMsg{err: fmt.Errorf("%s connection timed out. Finish OAuth at %s", spec.Label, authURL)}
		}
		return channelIntegrationDoneMsg{err: fmt.Errorf("%s connection timed out", spec.Label)}
	}
}

func resetTeamSession() tea.Cmd {
	return func() tea.Msg {
		l, err := team.NewLauncher("")
		if err != nil {
			return channelResetDoneMsg{err: err}
		}
		if err := l.ResetSession(); err != nil {
			return channelResetDoneMsg{err: err}
		}
		return channelResetDoneMsg{}
	}
}

func reconfigureTeamAgents() tea.Cmd {
	return func() tea.Msg {
		l, err := team.NewLauncher("")
		if err != nil {
			return channelInitDoneMsg{err: err}
		}
		if err := l.ReconfigureSession(); err != nil {
			return channelInitDoneMsg{err: err}
		}
		return channelInitDoneMsg{}
	}
}

func tickChannel() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg {
		return channelTickMsg(t)
	})
}

func mapString(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	v, ok := m[key]
	if !ok || v == nil {
		return ""
	}
	switch val := v.(type) {
	case string:
		return val
	default:
		return fmt.Sprintf("%v", val)
	}
}

func openBrowserURL(url string) error {
	var cmd *exec.Cmd
	switch {
	case url == "":
		return nil
	case isDarwin():
		cmd = exec.Command("open", url)
	case isLinux():
		cmd = exec.Command("xdg-open", url)
	case isWindows():
		cmd = exec.Command("cmd", "/c", "start", "", url)
	default:
		return fmt.Errorf("unsupported platform")
	}
	return cmd.Start()
}

func isDarwin() bool  { return runtime.GOOS == "darwin" }
func isLinux() bool   { return runtime.GOOS == "linux" }
func isWindows() bool { return runtime.GOOS == "windows" }

// killTeamSession kills the entire nex-team tmux session and all agent processes.
func killTeamSession() {
	// Kill tmux session (kills all agent processes in all panes/windows)
	exec.Command("tmux", "-L", "nex", "kill-session", "-t", "nex-team").Run()
	// Stop the broker
	http.Get("http://127.0.0.1:7890/health") // just to check; broker stops with the process
}

// renderA2UIBlocks extracts A2UI JSON blocks from message content,
// renders them via the GenerativeModel, and returns remaining text + rendered output.
// A2UI blocks are detected by ```a2ui ... ``` fences or inline {"type":"card",...} objects.
func renderA2UIBlocks(content string, width int) (textPart string, rendered string) {
	// Look for ```a2ui ... ``` fenced blocks
	fenceRe := regexp.MustCompile("(?s)```a2ui\\s*\n(.*?)```")
	matches := fenceRe.FindAllStringSubmatchIndex(content, -1)

	if len(matches) == 0 {
		// Also try to detect a bare A2UI JSON object embedded in the message.
		if idx := strings.Index(content, `{"type":"`); idx >= 0 {
			jsonStart, endIdx := extractJSONObject(content, idx)
			if jsonStart == "" {
				return content, ""
			}
			var comp tui.A2UIComponent
			if err := json.Unmarshal([]byte(jsonStart), &comp); err == nil && isA2UIType(comp.Type) {
				gm := tui.NewGenerativeModel()
				gm.SetWidth(width)
				gm.SetSchema(comp)
				if err := gm.Validate(); err != nil {
					return content, ""
				}
				parts := []string{strings.TrimSpace(content[:idx]), strings.TrimSpace(content[endIdx:])}
				textPart = strings.TrimSpace(strings.Join(parts, "\n"))
				rendered = gm.View()
				return
			}
		}
		return content, ""
	}

	// Process fenced blocks
	var textParts []string
	lastEnd := 0
	var renderedParts []string

	for _, match := range matches {
		// Text before the fence
		if match[0] > lastEnd {
			textParts = append(textParts, content[lastEnd:match[0]])
		}

		// Extract JSON inside fence
		jsonStr := content[match[2]:match[3]]
		var comp tui.A2UIComponent
		if err := json.Unmarshal([]byte(jsonStr), &comp); err == nil && isA2UIType(comp.Type) {
			gm := tui.NewGenerativeModel()
			gm.SetWidth(width)
			gm.SetSchema(comp)
			if err := gm.Validate(); err != nil {
				textParts = append(textParts, "```a2ui\n"+jsonStr+"\n```")
			} else {
				renderedParts = append(renderedParts, gm.View())
			}
		} else {
			// Invalid A2UI JSON — show as code block
			textParts = append(textParts, "```a2ui\n"+jsonStr+"\n```")
		}

		lastEnd = match[1]
	}

	// Text after last fence
	if lastEnd < len(content) {
		textParts = append(textParts, content[lastEnd:])
	}

	textPart = strings.TrimSpace(strings.Join(textParts, "\n"))
	rendered = strings.Join(renderedParts, "\n")
	return
}

func extractJSONObject(content string, start int) (string, int) {
	if start < 0 || start >= len(content) || content[start] != '{' {
		return "", 0
	}
	depth := 0
	inString := false
	escaped := false
	for i := start; i < len(content); i++ {
		ch := content[i]
		if escaped {
			escaped = false
			continue
		}
		if inString {
			if ch == '\\' {
				escaped = true
			} else if ch == '"' {
				inString = false
			}
			continue
		}
		switch ch {
		case '"':
			inString = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return content[start : i+1], i + 1
			}
		}
	}
	return "", 0
}

// isA2UIType checks if a type string is a valid A2UI component type.
func isA2UIType(t string) bool {
	switch t {
	case "row", "column", "card", "text", "textfield", "list", "table", "progress", "spacer":
		return true
	}
	return false
}

func runChannelView() {
	p := tea.NewProgram(newChannelModel(), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "channel view error: %v\n", err)
		os.Exit(1)
	}
}
