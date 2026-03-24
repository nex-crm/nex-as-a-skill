package main

import (
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
)

// Sidebar theme colors.
const (
	sidebarBG      = "#1A1D21"
	sidebarMuted   = "#ABABAD"
	sidebarDivider = "#35373B"
	sidebarActive  = "#1264A3"

	dotTalking  = "#2BAC76"
	dotThinking = "#E8912D"
	dotCoding   = "#8B5CF6"
	dotIdle     = "#ABABAD"
)

// sidebarAgentColors maps slugs to their display colors.
var sidebarAgentColors = map[string]string{
	"ceo": "#EAB308", "pm": "#22C55E", "fe": "#3B82F6",
	"be": "#8B5CF6", "ai": "#14B8A6", "designer": "#EC4899",
	"cmo": "#F97316", "cro": "#06B6D4", "you": "#FFFFFF",
}

// sidebarName returns a short name suitable for the narrow sidebar column.
func sidebarName(slug string) string {
	switch slug {
	case "ceo":
		return "CEO"
	case "pm":
		return "PM"
	case "fe":
		return "FE"
	case "be":
		return "BE"
	case "ai":
		return "AI"
	case "designer":
		return "Designer"
	case "cmo":
		return "CMO"
	case "cro":
		return "CRO"
	case "you":
		return "You"
	default:
		return slug
	}
}

// memberActivity describes what an agent is doing based on recency and content.
type memberActivity struct {
	Label string
	Color string
	Dot   string
}

// classifyActivity determines activity from last message time and content.
func classifyActivity(m channelMember) memberActivity {
	now := time.Now()
	elapsed := now.Sub(now) // default: max duration (idle)

	if m.LastTime != "" {
		for _, layout := range []string{
			time.RFC3339,
			"2006-01-02T15:04:05.000Z",
			"2006-01-02T15:04:05Z",
		} {
			if t, err := time.Parse(layout, m.LastTime); err == nil {
				elapsed = now.Sub(t)
				break
			}
		}
	}

	// Check for tool-use keywords indicating "coding".
	if elapsed < 30*time.Second && m.LastMessage != "" {
		lower := strings.ToLower(m.LastMessage)
		for _, kw := range []string{"bash", "edit", "read", "write", "grep", "glob"} {
			if strings.Contains(lower, kw) {
				return memberActivity{Label: "coding", Color: dotCoding, Dot: "\u26A1"}
			}
		}
	}

	if m.LastTime == "" {
		return memberActivity{Label: "idle", Color: dotIdle, Dot: "\u25CB"}
	}

	switch {
	case elapsed < 10*time.Second:
		return memberActivity{Label: "talking", Color: dotTalking, Dot: "\U0001F7E2"}
	case elapsed < 30*time.Second:
		return memberActivity{Label: "thinking", Color: dotThinking, Dot: "\U0001F7E1"}
	default:
		return memberActivity{Label: "idle", Color: dotIdle, Dot: "\u25CB"}
	}
}

// renderSidebar renders the Slack-style sidebar with channels and team members.
func renderSidebar(members []channelMember, activeChannel string, width, height int) string {
	if width < 2 {
		return ""
	}

	bg := lipgloss.Color(sidebarBG)
	innerW := width - 2 // 1 char padding each side

	// --- Channels section ---
	headerStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color(sidebarMuted)).
		Bold(true)

	var lines []string
	lines = append(lines, "") // top padding
	lines = append(lines, " "+headerStyle.Render("Channels"))

	// Channel entry: active = white text + blue left bar; inactive = muted.
	chName := "# general"
	if activeChannel == "" || activeChannel == "general" {
		activeBar := lipgloss.NewStyle().
			Foreground(lipgloss.Color(sidebarActive)).
			Render("\u2588\u2588")
		chText := lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FFFFFF")).
			Bold(true).
			Render(chName)
		lines = append(lines, activeBar+chText)
	} else {
		lines = append(lines, "  "+lipgloss.NewStyle().
			Foreground(lipgloss.Color(sidebarMuted)).
			Render(chName))
	}

	// --- Divider ---
	dividerStyle := lipgloss.NewStyle().Foreground(lipgloss.Color(sidebarDivider))
	divider := dividerStyle.Render(strings.Repeat("\u2500", innerW))
	lines = append(lines, " "+divider)

	// --- Team section ---
	lines = append(lines, " "+headerStyle.Render("Team"))

	// Calculate how many member rows we can fit.
	// Reserve 1 line for possible "+N more" overflow indicator.
	usedLines := len(lines)
	maxMembers := height - usedLines - 1 // -1 for potential overflow line
	if maxMembers < 0 {
		maxMembers = 0
	}

	activityStyle := lipgloss.NewStyle().Foreground(lipgloss.Color(sidebarMuted))

	visibleCount := len(members)
	overflow := 0
	if visibleCount > maxMembers {
		overflow = visibleCount - maxMembers
		visibleCount = maxMembers
	}

	for i := 0; i < visibleCount; i++ {
		m := members[i]
		act := classifyActivity(m)

		// Status dot.
		dotStyle := lipgloss.NewStyle().Foreground(lipgloss.Color(act.Color))
		dot := dotStyle.Render(act.Dot)

		// Agent name in agent color.
		agentColor := sidebarAgentColors[m.Slug]
		if agentColor == "" {
			agentColor = "#64748B"
		}
		name := sidebarName(m.Slug)
		nameStyle := lipgloss.NewStyle().
			Foreground(lipgloss.Color(agentColor)).
			Bold(true)
		nameRendered := nameStyle.Render(name)

		// Activity label.
		labelRendered := activityStyle.Render(act.Label)

		// Compose line: " dot name   activity" — right-align activity within innerW.
		// We need to calculate visible widths to pad correctly.
		leftPart := dot + " " + nameRendered
		leftVisible := ansi.StringWidth(leftPart)
		rightVisible := ansi.StringWidth(act.Label)

		pad := innerW - leftVisible - rightVisible
		if pad < 1 {
			pad = 1
		}

		line := " " + leftPart + strings.Repeat(" ", pad) + labelRendered
		lines = append(lines, line)
	}

	if overflow > 0 {
		more := activityStyle.Render(fmt.Sprintf("\u22EF +%d more", overflow))
		lines = append(lines, " "+more)
	}

	// Pad remaining height with empty lines.
	for len(lines) < height {
		lines = append(lines, "")
	}

	// Truncate if somehow over height.
	if len(lines) > height {
		lines = lines[:height]
	}

	// Apply sidebar background to each line, padded to full width.
	panel := lipgloss.NewStyle().
		Width(width).
		Background(bg)

	var rendered []string
	for _, l := range lines {
		rendered = append(rendered, panel.Render(l))
	}

	return strings.Join(rendered, "\n")
}
