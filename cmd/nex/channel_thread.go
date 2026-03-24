package main

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
)

// renderThreadPanel renders the thread side panel with parent message,
// reply count divider, replies, and its own input field.
func renderThreadPanel(allMessages []brokerMessage, parentID string,
	width, height int, threadInput []rune, threadInputPos int,
	threadScroll int, focused bool) string {

	if width < 8 || height < 4 {
		return ""
	}

	bg := lipgloss.Color(slackThreadBg)
	innerW := width - 2 // 1 char padding each side

	// ── Header: "Thread" + "✕" ────────────────────────────────────────
	headerStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FFFFFF")).
		Bold(true)
	closeStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color(slackMuted))

	titleText := headerStyle.Render("Thread")
	closeText := closeStyle.Render("✕ Esc")
	titleWidth := lipgloss.Width(titleText)
	closeWidth := lipgloss.Width(closeText)
	headerPad := innerW - titleWidth - closeWidth
	if headerPad < 1 {
		headerPad = 1
	}
	headerLine := titleText + strings.Repeat(" ", headerPad) + closeText

	dividerStyle := lipgloss.NewStyle().Foreground(lipgloss.Color(slackDivider))
	headerDivider := dividerStyle.Render(strings.Repeat("─", innerW))

	// ── Find parent message ───────────────────────────────────────────
	parent, parentFound := findMessageByID(allMessages, parentID)

	// ── Collect replies ───────────────────────────────────────────────
	var replies []brokerMessage
	for _, msg := range allMessages {
		if msg.ReplyTo == parentID {
			replies = append(replies, msg)
		}
	}

	// ── Build content lines ───────────────────────────────────────────
	var contentLines []string

	// Parent message
	if parentFound {
		contentLines = append(contentLines, renderThreadMessage(parent, innerW, true)...)
		contentLines = append(contentLines, "")

		// Reply count divider
		replyCount := len(replies)
		if replyCount > 0 {
			replyWord := "reply"
			if replyCount != 1 {
				replyWord = "replies"
			}
			divLabel := fmt.Sprintf(" %d %s ", replyCount, replyWord)
			lineLen := innerW - len(divLabel) - 2
			if lineLen < 4 {
				lineLen = 4
			}
			leftSeg := strings.Repeat("─", lineLen/2)
			rightSeg := strings.Repeat("─", lineLen-lineLen/2)
			contentLines = append(contentLines,
				dividerStyle.Render(leftSeg+divLabel+rightSeg))
			contentLines = append(contentLines, "")
		}

		// Replies with grouping
		groups := groupMessages(replies)
		replyCountFn := func(id string) (int, string) {
			return countReplies(allMessages, id)
		}
		replyLines := renderMessageGroups(groups, innerW, agentColorMap, replyCountFn)
		contentLines = append(contentLines, replyLines...)
	} else {
		contentLines = append(contentLines,
			lipgloss.NewStyle().
				Foreground(lipgloss.Color(slackMuted)).
				Render("  Thread message not found."))
	}

	// ── Thread input field ────────────────────────────────────────────
	inputH := 3 // border top + input line + border bottom
	usedH := 3  // header line + header divider + blank
	contentH := height - usedH - inputH
	if contentH < 1 {
		contentH = 1
	}

	// Apply scroll to content
	total := len(contentLines)
	scroll := clampScroll(total, contentH, threadScroll)
	end := total - scroll
	if end > total {
		end = total
	}
	if end < 1 && total > 0 {
		end = 1
	}
	start := end - contentH
	if start < 0 {
		start = 0
	}

	var visible []string
	if total > 0 {
		visible = contentLines[start:end]
	}
	for len(visible) < contentH {
		visible = append(visible, "")
	}

	// ── Thread input ──────────────────────────────────────────────────
	threadInputRendered := renderThreadInput(threadInput, threadInputPos, innerW-2, focused)

	// ── Compose panel ─────────────────────────────────────────────────
	var panelLines []string
	panelLines = append(panelLines, " "+headerLine)
	panelLines = append(panelLines, " "+headerDivider)
	for _, line := range visible {
		panelLines = append(panelLines, " "+line)
	}
	panelLines = append(panelLines, threadInputRendered)

	// Pad/trim to exact height
	for len(panelLines) < height {
		panelLines = append(panelLines, "")
	}
	if len(panelLines) > height {
		panelLines = panelLines[:height]
	}

	// Apply background to each line
	panelStyle := lipgloss.NewStyle().
		Width(width).
		Background(bg)

	var rendered []string
	for _, l := range panelLines {
		rendered = append(rendered, panelStyle.Render(l))
	}

	return strings.Join(rendered, "\n")
}

// renderThreadMessage renders a single message in thread style (compact).
func renderThreadMessage(msg brokerMessage, width int, isParent bool) []string {
	color := agentColorMap[msg.From]
	if color == "" {
		color = "#9CA3AF"
	}
	nameStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color(color)).
		Bold(true)
	tsStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color(slackTimestamp))

	name := displayName(msg.From)
	ts := formatShortTime(msg.Timestamp)

	nameRendered := nameStyle.Render(name)
	tsRendered := tsStyle.Render(ts)
	nameWidth := lipgloss.Width(nameRendered)
	tsWidth := lipgloss.Width(tsRendered)
	gap := width - nameWidth - tsWidth - 4
	if gap < 2 {
		gap = 2
	}

	var lines []string
	lines = append(lines, fmt.Sprintf("  %s%s%s",
		nameRendered, strings.Repeat(" ", gap), tsRendered))

	// Render content
	textPart, a2uiRendered := renderA2UIBlocks(msg.Content, width-4)
	for _, paragraph := range strings.Split(textPart, "\n") {
		paragraph = highlightMentions(paragraph, agentColorMap)
		wrapped := ansi.Wrap(paragraph, width-4, "")
		for _, wl := range strings.Split(wrapped, "\n") {
			lines = append(lines, "  "+wl)
		}
	}
	if a2uiRendered != "" {
		for _, renderedLine := range strings.Split(a2uiRendered, "\n") {
			lines = append(lines, "  "+renderedLine)
		}
	}

	return lines
}

// renderThreadInput renders the input area at the bottom of the thread panel.
func renderThreadInput(input []rune, inputPos int, width int, focused bool) string {
	if width < 6 {
		width = 6
	}

	var inputStr string
	if len(input) == 0 {
		cursorStyle := lipgloss.NewStyle().Reverse(true)
		placeholder := lipgloss.NewStyle().
			Foreground(lipgloss.Color(slackMuted)).
			Render(" Reply...")
		inputStr = cursorStyle.Render(" ") + placeholder
	} else {
		before := string(input[:inputPos])
		cursorStyle := lipgloss.NewStyle().Reverse(true)
		var cursor, after string
		if inputPos < len(input) {
			cursor = cursorStyle.Render(string(input[inputPos]))
			after = string(input[inputPos+1:])
		} else {
			cursor = cursorStyle.Render(" ")
			after = ""
		}
		inputStr = before + cursor + after
	}

	inputStr = ansi.Wrap(inputStr, width-2, "")

	borderColor := slackInputBorder
	if focused {
		borderColor = slackInputFocus
	}
	borderStyle := lipgloss.NewStyle().
		Width(width).
		BorderStyle(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color(borderColor)).
		Padding(0, 1)

	return " " + borderStyle.Render(inputStr)
}
