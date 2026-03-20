package tui

import (
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

const rosterWidth = 22

var activePhases = map[string]bool{
	"build_context": true,
	"stream_llm":    true,
	"execute_tool":  true,
}

type AgentEntry struct {
	Slug  string
	Name  string
	Phase string
}

type RosterModel struct {
	agents  []AgentEntry
	spinner SpinnerModel
	width   int
}

func NewRoster() RosterModel {
	s := NewSpinner("")
	return RosterModel{
		spinner: s,
		width:   rosterWidth,
	}
}

func (r *RosterModel) UpdateAgents(agents []AgentEntry) {
	r.agents = agents

	// Keep spinner active if any agent is in an active phase
	anyActive := false
	for _, ag := range agents {
		if activePhases[ag.Phase] {
			anyActive = true
			break
		}
	}
	r.spinner.SetActive(anyActive)
}

func (r RosterModel) Update(msg tea.Msg) (RosterModel, tea.Cmd) {
	var cmd tea.Cmd
	r.spinner, cmd = r.spinner.Update(msg)
	return r, cmd
}

func (r RosterModel) View() string {
	header := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color(NexPurple)).
		Render("AGENTS")

	var rows []string
	rows = append(rows, header)

	for _, ag := range r.agents {
		icon := r.agentIcon(ag.Phase)
		nameStr := ag.Name
		if len(nameStr) > rosterWidth-6 {
			nameStr = nameStr[:rosterWidth-6]
		}

		phaseLabel := phaseShortLabel(ag.Phase)

		var iconStyle lipgloss.Style
		switch ag.Phase {
		case "error":
			iconStyle = ErrorStyle
		case "done":
			iconStyle = SuccessStyle
		default:
			iconStyle = SystemStyle
		}

		line := iconStyle.Render(icon) + " " +
			lipgloss.NewStyle().Foreground(lipgloss.Color(ValueColor)).Render(nameStr) +
			" " + SystemStyle.Render(phaseLabel)

		rows = append(rows, line)
	}

	inner := strings.Join(rows, "\n")

	sidebar := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#374151")).
		Padding(1, 1).
		Width(rosterWidth)

	return sidebar.Render(inner)
}

func (r RosterModel) agentIcon(phase string) string {
	switch phase {
	case "idle":
		return "○"
	case "done":
		return "●"
	case "error":
		return "●"
	default:
		if activePhases[phase] {
			return spinnerFrames[r.spinner.frame]
		}
		return "○"
	}
}

func phaseShortLabel(phase string) string {
	switch phase {
	case "idle":
		return "idle"
	case "build_context":
		return "ctx"
	case "stream_llm":
		return "llm"
	case "execute_tool":
		return "tool"
	case "done":
		return "done"
	case "error":
		return "err"
	default:
		return phase
	}
}
