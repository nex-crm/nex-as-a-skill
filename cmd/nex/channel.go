package main

import (
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

// channelMsg carries messages polled from the broker.
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

type channelModel struct {
	messages    []brokerMessage
	lastID      string
	width       int
	height      int
	scroll      int
	err         error
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
		case "q", "ctrl+c":
			return m, tea.Quit
		case "j", "down":
			if m.scroll > 0 {
				m.scroll--
			}
		case "k", "up":
			m.scroll++
		case "G":
			m.scroll = 0
		}

	case channelMsg:
		if len(msg.messages) > 0 {
			m.messages = append(m.messages, msg.messages...)
			m.lastID = msg.messages[len(msg.messages)-1].ID
			// Auto-scroll to bottom when new messages arrive
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
		Foreground(lipgloss.Color("#cf72d9")).
		Padding(0, 1)

	agentColors := map[string]string{
		"ceo":      "#EAB308",
		"pm":       "#22C55E",
		"fe":       "#3B82F6",
		"be":       "#8B5CF6",
		"designer": "#EC4899",
		"cmo":      "#F97316",
		"cro":      "#06B6D4",
	}

	mutedStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#6B7280"))
	statusStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#9CA3AF")).Italic(true)

	// Title
	title := titleStyle.Render("nex team channel")
	hint := mutedStyle.Render("  q=quit  j/k=scroll  G=bottom  Ctrl+B w=switch window")

	// Messages
	var lines []string
	if len(m.messages) == 0 {
		lines = append(lines, "")
		lines = append(lines, mutedStyle.Render("  Waiting for team activity..."))
		lines = append(lines, mutedStyle.Render("  Switch to agent windows (Ctrl+B then 1-7) and start a conversation."))
		lines = append(lines, mutedStyle.Render("  Agents use team_broadcast to post here."))
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

	// Scrollable viewport
	viewHeight := m.height - 4 // title + status + borders
	if viewHeight < 1 {
		viewHeight = 1
	}

	total := len(lines)
	end := total - m.scroll
	if end > total {
		end = total
	}
	if end < 1 {
		end = 1
	}
	start := end - viewHeight
	if start < 0 {
		start = 0
	}

	visible := lines[start:end]
	// Pad to fill viewport
	for len(visible) < viewHeight {
		visible = append(visible, "")
	}

	// Status bar
	agentCount := countUniqueAgents(m.messages)
	statusBar := mutedStyle.Render(fmt.Sprintf(
		" %d messages │ %d agents active │ polling broker",
		len(m.messages), agentCount,
	))

	return title + hint + "\n" +
		strings.Join(visible, "\n") + "\n" +
		statusBar
}

func countUniqueAgents(messages []brokerMessage) int {
	seen := make(map[string]bool)
	for _, m := range messages {
		seen[m.From] = true
	}
	return len(seen)
}

func pollBroker(sinceID string) tea.Cmd {
	return func() tea.Msg {
		url := fmt.Sprintf("http://127.0.0.1:7890/messages?limit=50")
		if sinceID != "" {
			url += "&since_id=" + sinceID
		}

		resp, err := http.Get(url)
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
