package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

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

var mentionPattern = regexp.MustCompile(`@([A-Za-z0-9_-]+)`)

type channelModel struct {
	messages       []brokerMessage
	members        []channelMember
	pending        *channelInterview
	lastID         string
	input          []rune
	inputPos       int
	width          int
	height         int
	scroll         int
	posting        bool
	selectedOption int
}

func newChannelModel() channelModel {
	return channelModel{}
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
		switch msg.String() {
		case "ctrl+c":
			killTeamSession()
			return m, tea.Quit
		case "enter":
			if len(m.input) > 0 {
				text := string(m.input)
				m.input = nil
				m.inputPos = 0

				// Handle /quit and /exit commands
				trimmed := strings.TrimSpace(text)
				if trimmed == "/quit" || trimmed == "/exit" || trimmed == "/q" {
					killTeamSession()
					return m, tea.Quit
				}

				m.posting = true
				if m.pending != nil {
					return m, postInterviewAnswer(*m.pending, "", "", text)
				}
				return m, postToChannel(text)
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
			}
		case "ctrl+u":
			m.input = nil
			m.inputPos = 0
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
		case "down":
			if m.pending != nil && m.selectedOption < len(m.pending.Options)-1 {
				m.selectedOption++
			} else {
				m.scroll--
				if m.scroll < 0 {
					m.scroll = 0
				}
			}
		case "pgup":
			m.scroll += 10
		case "pgdown":
			m.scroll -= 10
			if m.scroll < 0 {
				m.scroll = 0
			}
		default:
			// Type character
			if len(msg.String()) == 1 || msg.Type == tea.KeyRunes {
				ch := msg.Runes
				if len(ch) > 0 {
					tail := make([]rune, len(m.input[m.inputPos:]))
					copy(tail, m.input[m.inputPos:])
					m.input = append(m.input[:m.inputPos], append(ch, tail...)...)
					m.inputPos += len(ch)
				}
			}
		}

	case channelPostDoneMsg:
		m.posting = false

	case channelInterviewAnswerDoneMsg:
		m.posting = false
		if msg.err == nil {
			m.pending = nil
			m.input = nil
			m.inputPos = 0
		}

	case channelMsg:
		if len(msg.messages) > 0 {
			m.messages = append(m.messages, msg.messages...)
			m.lastID = msg.messages[len(msg.messages)-1].ID
			if m.scroll < 3 {
				m.scroll = 0
			}
		}

	case channelMembersMsg:
		m.members = msg.members

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
		"be": "#8B5CF6", "designer": "#EC4899", "cmo": "#F97316",
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
		titleStyle.Render("# ai-notetaker-company"),
		"  ",
		headerMetaStyle.Render("Founding Team channel"),
	)
	headerLine2 := headerMetaStyle.Render("Organic company chat. CEO decides, teammates debate, channel stays ephemeral.")
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
		placeholder := " Type a message to the team... (/quit to exit)"
		if m.pending != nil {
			placeholder = " Type a custom answer, or press Enter to accept the selected option"
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
	composerLabel := "Message #ai-notetaker-company"
	if m.pending != nil {
		composerLabel = fmt.Sprintf("Answer @%s's question", m.pending.From)
	}
	composerTitle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#93C5FD")).
		Bold(true).
		Render(composerLabel)

	// Messages
	viewHeight := m.height - 9 // header + composer + status
	if viewHeight < 1 {
		viewHeight = 1
	}

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
		for _, msg := range m.messages {
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
				lines = appendWrapped(lines, contentWidth, fmt.Sprintf("  %s  %s %s",
					mutedStyle.Render(ts),
					nameStyle.Render("@"+msg.From),
					statusStyle.Render("is "+status),
				))
			} else {
				mood := inferMood(msg.Content)
				meta := roleLabel(msg.From)
				if mood != "" {
					meta += " · " + mood
				}
				metaStyle := mutedStyle
				if mood != "" {
					metaStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(color))
				}
				lines = append(lines, "")
				lines = appendWrapped(lines, contentWidth,
					fmt.Sprintf("  %s  %s  %s", nameStyle.Render(displayName(msg.From)), mutedStyle.Render(ts), metaStyle.Render(meta)),
				)

				prefix := "  " + ruleStyle.Render("│") + " "

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
			}
		}
	}
	interviewCard := ""
	if m.pending != nil {
		interviewCard = renderInterviewCard(*m.pending, m.selectedOption, inputWidth)
	}

	// Scroll
	total := len(lines)
	end := total - m.scroll
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
	if m.scroll > 0 {
		scrollHint = fmt.Sprintf("scroll +%d", m.scroll)
	}
	statusBar := mutedStyle.Render(fmt.Sprintf(
		" %d messages │ %d agents active │ %s │ Ctrl+B {/}=swap pane │ Ctrl+B z=zoom pane",
		len(m.messages), agentCount, scrollHint,
	))
	if m.pending != nil {
		statusBar = lipgloss.NewStyle().Foreground(lipgloss.Color("#FBBF24")).Render(
			" Interview pending │ team paused until you answer │ ↑/↓ choose option │ Enter submit",
		)
	}

	return titleBar + "\n" +
		body + "\n" +
		interviewCard +
		composerTitle + "\n" +
		inputBox + "\n" +
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

func (m channelModel) selectedInterviewOption() *channelInterviewOption {
	if m.pending == nil || len(m.pending.Options) == 0 {
		return nil
	}
	if m.selectedOption < 0 || m.selectedOption >= len(m.pending.Options) {
		return &m.pending.Options[0]
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
	wrapped := lipgloss.NewStyle().Width(width).Render(text)
	return append(lines, strings.Split(wrapped, "\n")...)
}

func displayName(slug string) string {
	switch slug {
	case "ceo":
		return "CEO"
	case "pm":
		return "Product Manager"
	case "fe":
		return "FE Engineer"
	case "be":
		return "BE Engineer"
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
	if len(interview.Options) > 0 {
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
		lines = append(lines, "", muted.Render("Press Enter to accept the selected option, or type your own answer below."))
	}
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

func postToChannel(text string) tea.Cmd {
	return func() tea.Msg {
		body, _ := json.Marshal(map[string]any{
			"from":    "you",
			"content": text,
			"tagged":  extractTagsFromText(text),
		})
		resp, err := http.Post(
			"http://127.0.0.1:7890/messages",
			"application/json",
			bytes.NewReader(body),
		)
		if err != nil {
			return channelPostDoneMsg{err: err}
		}
		resp.Body.Close()
		return channelPostDoneMsg{}
	}
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
		client := &http.Client{Timeout: 2 * time.Second}
		resp, err := client.Get(url)
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
		client := &http.Client{Timeout: 2 * time.Second}
		resp, err := client.Get("http://127.0.0.1:7890/members")
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
		client := &http.Client{Timeout: 2 * time.Second}
		resp, err := client.Get("http://127.0.0.1:7890/interview")
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
		resp, err := http.Post(
			"http://127.0.0.1:7890/interview/answer",
			"application/json",
			bytes.NewReader(body),
		)
		if err != nil {
			return channelInterviewAnswerDoneMsg{err: err}
		}
		resp.Body.Close()
		return channelInterviewAnswerDoneMsg{}
	}
}

func tickChannel() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg {
		return channelTickMsg(t)
	})
}

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
		// Also try to detect bare A2UI JSON objects: {"type":"card", ...}
		if idx := strings.Index(content, `{"type":"`); idx >= 0 {
			jsonStart := content[idx:]
			var comp tui.A2UIComponent
			if err := json.Unmarshal([]byte(jsonStart), &comp); err == nil && isA2UIType(comp.Type) {
				gm := tui.NewGenerativeModel()
				gm.SetSchema(comp)
				textPart = strings.TrimSpace(content[:idx])
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
			gm.SetSchema(comp)
			renderedParts = append(renderedParts, gm.View())
		} else {
			// Invalid A2UI JSON — show as code block
			textParts = append(textParts, "```\n"+jsonStr+"```")
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
