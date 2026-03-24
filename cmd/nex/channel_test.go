package main

import (
	"regexp"
	"strings"
	"testing"
)

var ansiPattern = regexp.MustCompile(`\x1b\[[0-9;]*m`)

func stripANSI(s string) string {
	return ansiPattern.ReplaceAllString(s, "")
}

func TestRenderA2UIBlocksPromptExampleRendersListItems(t *testing.T) {
	content := "```a2ui\n" +
		`{"type":"card","props":{"title":"Sprint Plan"},"children":[{"type":"list","props":{"items":["Build auth","Design UI"]}}]}` +
		"\n```"

	textPart, rendered := renderA2UIBlocks(content, 48)
	if textPart != "" {
		t.Fatalf("expected no plain text, got %q", textPart)
	}
	if !strings.Contains(rendered, "Sprint Plan") {
		t.Fatalf("expected rendered card title, got %q", rendered)
	}
	if !strings.Contains(rendered, "Build auth") || !strings.Contains(rendered, "Design UI") {
		t.Fatalf("expected prompt-example list items to render, got %q", rendered)
	}
}

func TestRenderA2UIBlocksInlineJSONPreservesTrailingText(t *testing.T) {
	content := `Before {"type":"text","props":{"content":"Hello"}} after`

	textPart, rendered := renderA2UIBlocks(content, 40)
	if !strings.Contains(textPart, "Before") || !strings.Contains(textPart, "after") {
		t.Fatalf("expected leading and trailing prose to survive, got %q", textPart)
	}
	if !strings.Contains(rendered, "Hello") {
		t.Fatalf("expected inline A2UI JSON to render, got %q", rendered)
	}
}

func TestRenderA2UIBlocksInvalidNestedSchemaFallsBackToFence(t *testing.T) {
	content := "```a2ui\n" +
		`{"type":"card","children":[{"type":"bogus"}]}` +
		"\n```"

	textPart, rendered := renderA2UIBlocks(content, 40)
	if rendered != "" {
		t.Fatalf("expected invalid schema not to render, got %q", rendered)
	}
	if !strings.Contains(textPart, "```a2ui") || !strings.Contains(textPart, `"type":"bogus"`) {
		t.Fatalf("expected original fenced JSON fallback, got %q", textPart)
	}
}

func TestRenderA2UIBlocksRespectsRequestedWidth(t *testing.T) {
	content := "```a2ui\n" +
		`{"type":"card","props":{"title":"Width Test"},"children":[{"type":"text","props":{"content":"This is a long line that should wrap inside a narrow card instead of rendering at the default width."}}]}` +
		"\n```"

	_, rendered := renderA2UIBlocks(content, 28)
	for _, line := range strings.Split(stripANSI(rendered), "\n") {
		if len([]rune(line)) > 32 {
			t.Fatalf("expected rendered output to fit narrow width, got line %q (%d chars)", line, len([]rune(line)))
		}
	}
}

func TestAppendWrappedWrapsLongLines(t *testing.T) {
	lines := appendWrapped(nil, 12, "this is a long line that should wrap")
	if len(lines) < 2 {
		t.Fatalf("expected wrapped output to span multiple lines, got %q", lines)
	}
}

func TestClampScrollCapsToBufferHeight(t *testing.T) {
	if got := clampScroll(10, 4, 99); got != 6 {
		t.Fatalf("expected scroll to clamp to 6, got %d", got)
	}
	if got := clampScroll(3, 10, 5); got != 0 {
		t.Fatalf("expected scroll to clamp to 0 for short buffer, got %d", got)
	}
}
