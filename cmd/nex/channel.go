package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type channelMsg struct {
	messages []brokerMessage
}

type brokerMessage struct {
	ID        string   `json:"id"`
	From      string   `json:"from"`
	Content   string   `json:"content"`
	Tagged    []string `json:"tagged"`
	Timestamp string   `json:"timestamp"`
}

type channelTickMsg time.Time
type channelPostDoneMsg struct{ err error }

type channelModel struct {
	messages   []brokerMessage
	lastID     string
	input      []rune
	inputPos   int
	width      int
	height     int
	scroll     int
	posting    bool
}

func newChannelModel() channelModel {
	return channelModel{}
}

func (m channelModel) Init() tea.Cmd {
	return tea.Batch(
		pollBroker(""),
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
			return m, tea.Quit
		case "enter":
			if len(m.input) > 0 {
				text := string(m.input)
				m.input = nil
				m.inputPos = 0
				m.posting = true
				return m, postToChannel(text)
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

	case channelMsg:
		if len(msg.messages) > 0 {
			m.messages = append(m.messages, msg.messages...)
			m.lastID = msg.messages[len(msg.messages)-1].ID
			if m.scroll < 3 {
				m.scroll = 0
			}
		}

	case channelTickMsg:
		return m, tea.Batch(
			pollBroker(m.lastID),
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
		Foreground(lipgloss.Color("#cf72d9"))

	agentColors := map[string]string{
		"ceo": "#EAB308", "pm": "#22C55E", "fe": "#3B82F6",
		"be": "#8B5CF6", "designer": "#EC4899", "cmo": "#F97316",
		"cro": "#06B6D4", "you": "#FFFFFF",
	}

	mutedStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#6B7280"))
	statusStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#9CA3AF")).Italic(true)

	// Title bar
	title := titleStyle.Render(" nex team channel")
	hint := mutedStyle.Render("  Ctrl+B 1=agents  Ctrl+B w=windows  Ctrl+C=quit")
	titleBar := title + hint

	// Input field
	inputWidth := m.width - 6
	if inputWidth < 20 {
		inputWidth = 20
	}

	var inputStr string
	if len(m.input) == 0 {
		inputStr = mutedStyle.Render("Type a message to the team...")
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
		BorderForeground(lipgloss.Color("#374151")).
		Width(inputWidth).
		Padding(0, 1)
	inputBox := inputBorder.Render(inputStr)

	// Messages
	viewHeight := m.height - 5 // title + input + status
	if viewHeight < 1 {
		viewHeight = 1
	}

	var lines []string
	if len(m.messages) == 0 {
		lines = append(lines, "")
		lines = append(lines, mutedStyle.Render("  Waiting for team activity..."))
		lines = append(lines, mutedStyle.Render("  Switch to agent windows (Ctrl+B 1) and tell them to use team_broadcast."))
		lines = append(lines, mutedStyle.Render("  Or type a message here to post as 'you'."))
	} else {
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

			if strings.HasPrefix(msg.Content, "[STATUS]") {
				status := strings.TrimPrefix(msg.Content, "[STATUS] ")
				lines = append(lines, fmt.Sprintf("  %s  %s %s",
					mutedStyle.Render(ts),
					nameStyle.Render("@"+msg.From),
					statusStyle.Render("is "+status),
				))
			} else {
				lines = append(lines, fmt.Sprintf("  %s  %s: %s",
					mutedStyle.Render(ts),
					nameStyle.Render("@"+msg.From),
					msg.Content,
				))
			}
		}
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

	// Status bar
	agentCount := countUniqueAgents(m.messages)
	statusBar := mutedStyle.Render(fmt.Sprintf(
		" %d messages │ %d agents │ Ctrl+B 1=agent panes │ Ctrl+B 2-8=individual agents",
		len(m.messages), agentCount,
	))

	return titleBar + "\n" +
		strings.Join(visible, "\n") + "\n" +
		inputBox + "\n" +
		statusBar
}

func countUniqueAgents(messages []brokerMessage) int {
	seen := make(map[string]bool)
	for _, m := range messages {
		seen[m.From] = true
	}
	return len(seen)
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

func tickChannel() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg {
		return channelTickMsg(t)
	})
}

func runChannelView() {
	p := tea.NewProgram(newChannelModel(), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "channel view error: %v\n", err)
		os.Exit(1)
	}
}
