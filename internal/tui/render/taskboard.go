package render

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// TaskCard represents a single task on the kanban board.
type TaskCard struct {
	Title    string
	Priority string // "urgent", "high", "medium", "low", ""
	Status   string // "todo", "in_progress", "done"
	Due      string
	Ref      string // entity reference
}

var (
	todoHeaderStyle       = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#4d97ff"))
	inProgressHeaderStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#df750c"))
	doneHeaderStyle       = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#03a04c"))

	urgentBadgeStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#e23428"))
	highBadgeStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("#df750c"))
	medBadgeStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("#4d97ff"))
	lowBadgeStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("#838485"))

	dueDateStyle = MutedStyle
	separatorStyle = MutedStyle
)

// priorityBadge returns the styled priority indicator for a task.
func priorityBadge(priority string) string {
	switch priority {
	case "urgent":
		return urgentBadgeStyle.Render("!!!")
	case "high":
		return highBadgeStyle.Render("!!")
	case "medium":
		return medBadgeStyle.Render("!")
	case "low":
		return lowBadgeStyle.Render("·")
	default:
		return lowBadgeStyle.Render("·")
	}
}

// RenderTaskboard renders a kanban-style taskboard with 3 columns.
func RenderTaskboard(tasks []TaskCard, width int) string {
	if len(tasks) == 0 {
		return "(no tasks)"
	}

	// Sort tasks into columns.
	var todo, inProgress, done []TaskCard
	for _, t := range tasks {
		switch t.Status {
		case "todo":
			todo = append(todo, t)
		case "in_progress":
			inProgress = append(inProgress, t)
		case "done":
			done = append(done, t)
		default:
			todo = append(todo, t)
		}
	}

	// Column widths: (width - 6) / 3, accounting for " │ " separators (2 separators × 3 chars).
	colWidth := (width - 6) / 3
	if colWidth < 10 {
		colWidth = 10
	}

	sep := separatorStyle.Render(" │ ")

	// Render column headers.
	headers := []string{
		todoHeaderStyle.Render(pad("To Do ○", colWidth)),
		inProgressHeaderStyle.Render(pad("In Progress ◐", colWidth)),
		doneHeaderStyle.Render(pad("Done ●", colWidth)),
	}
	headerLine := headers[0] + sep + headers[1] + sep + headers[2]

	// Render divider under headers.
	divider := MutedStyle.Render(strings.Repeat("─", colWidth)) + sep +
		MutedStyle.Render(strings.Repeat("─", colWidth)) + sep +
		MutedStyle.Render(strings.Repeat("─", colWidth))

	// Render card lines for each column.
	todoLines := renderColumnCards(todo, colWidth)
	inProgressLines := renderColumnCards(inProgress, colWidth)
	doneLines := renderColumnCards(done, colWidth)

	// Pad columns to equal length.
	maxRows := max(len(todoLines), len(inProgressLines), len(doneLines))
	todoLines = padLines(todoLines, maxRows, colWidth)
	inProgressLines = padLines(inProgressLines, maxRows, colWidth)
	doneLines = padLines(doneLines, maxRows, colWidth)

	// Assemble rows.
	var sb strings.Builder
	sb.WriteString(headerLine)
	sb.WriteString("\n")
	sb.WriteString(divider)
	sb.WriteString("\n")

	for i := 0; i < maxRows; i++ {
		sb.WriteString(todoLines[i])
		sb.WriteString(sep)
		sb.WriteString(inProgressLines[i])
		sb.WriteString(sep)
		sb.WriteString(doneLines[i])
		if i < maxRows-1 {
			sb.WriteString("\n")
		}
	}

	return sb.String()
}

// renderColumnCards renders task cards as lines for a single column.
// Each card produces 1-2 lines: badge + title, and optionally a due date line.
func renderColumnCards(cards []TaskCard, colWidth int) []string {
	var lines []string
	for i, card := range cards {
		if i > 0 {
			lines = append(lines, padRight("", colWidth))
		}

		badge := priorityBadge(card.Priority)
		// Badge takes ~3 visible chars + space, title gets the rest.
		badgeWidth := displayWidth(card.Priority)
		titleWidth := colWidth - badgeWidth - 1
		if titleWidth < 1 {
			titleWidth = 1
		}
		title := truncate(card.Title, titleWidth)
		line := badge + " " + title
		lines = append(lines, padRight(line, colWidth))

		if card.Due != "" {
			dueLine := dueDateStyle.Render("  due: " + card.Due)
			lines = append(lines, padRight(dueLine, colWidth))
		}
	}
	return lines
}

// displayWidth returns the visible character width of the priority badge.
func displayWidth(priority string) int {
	switch priority {
	case "urgent":
		return 3 // "!!!"
	case "high":
		return 2 // "!!"
	case "medium":
		return 1 // "!"
	default:
		return 1 // "·"
	}
}

// truncate trims a string to maxLen characters, adding "…" if truncated.
func truncate(s string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	if maxLen <= 1 {
		return "…"
	}
	return string(runes[:maxLen-1]) + "…"
}

// padRight pads a string with spaces to reach the target width.
// Uses rune length for padding calculation.
func padRight(s string, width int) string {
	runes := []rune(s)
	if len(runes) >= width {
		return s
	}
	return s + strings.Repeat(" ", width-len(runes))
}

// padLines extends a slice of lines to length n with blank padded lines.
func padLines(lines []string, n int, colWidth int) []string {
	for len(lines) < n {
		lines = append(lines, padRight("", colWidth))
	}
	return lines
}

// max returns the largest of the given integers.
func max(vals ...int) int {
	m := vals[0]
	for _, v := range vals[1:] {
		if v > m {
			m = v
		}
	}
	return m
}

// formatCount returns a summary line like "3 tasks (1 todo, 1 in progress, 1 done)".
func formatCount(todo, inProgress, done int) string {
	total := todo + inProgress + done
	return fmt.Sprintf("%d tasks (%d todo, %d in progress, %d done)", total, todo, inProgress, done)
}
