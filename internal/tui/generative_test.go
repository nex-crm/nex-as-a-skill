package tui

import (
	"strings"
	"testing"
)

func TestResolvePointer(t *testing.T) {
	data := map[string]any{
		"user": map[string]any{
			"name":   "Alice",
			"scores": []any{10, 20, 30},
		},
	}

	// Scalar / index lookups
	scalars := []struct {
		pointer string
		want    any
	}{
		{"/user/name", "Alice"},
		{"/user/scores/1", 20},
		{"/user/missing", nil},
	}
	for _, tt := range scalars {
		got := resolvePointer(data, tt.pointer)
		if got != tt.want {
			t.Errorf("resolvePointer(%q) = %v, want %v", tt.pointer, got, tt.want)
		}
	}

	// Empty pointer returns the root; just verify it is non-nil
	if got := resolvePointer(data, ""); got == nil {
		t.Error("resolvePointer('') should return the root data, got nil")
	}
}

func TestSetPointer(t *testing.T) {
	data := map[string]any{}
	setPointer(data, "/a/b/c", "hello")
	got := resolvePointer(data, "/a/b/c")
	if got != "hello" {
		t.Errorf("expected 'hello', got %v", got)
	}
}

func TestApplyUpdates(t *testing.T) {
	g := NewGenerativeModel()
	g.SetData(map[string]any{"name": "old"})

	g.ApplyUpdates([]A2UIDataUpdate{
		{Op: "set", Path: "/name", Value: "new"},
		{Op: "set", Path: "/count", Value: float64(42)},
	})

	if got := resolvePointer(g.data, "/name"); got != "new" {
		t.Errorf("expected 'new', got %v", got)
	}
	if got := resolvePointer(g.data, "/count"); got != float64(42) {
		t.Errorf("expected 42, got %v", got)
	}

	g.ApplyUpdates([]A2UIDataUpdate{{Op: "delete", Path: "/count"}})
	if got := resolvePointer(g.data, "/count"); got != nil {
		t.Errorf("expected nil after delete, got %v", got)
	}
}

func TestRenderCard(t *testing.T) {
	g := NewGenerativeModel()
	g.width = 40
	g.SetSchema(A2UIComponent{
		Type:  "card",
		Props: map[string]any{"title": "Test Card"},
		Children: []A2UIComponent{
			{
				Type:  "text",
				Props: map[string]any{"content": "Hello World"},
			},
		},
	})
	view := g.View()
	if !strings.Contains(view, "Test Card") {
		t.Errorf("card view missing title; got: %s", view)
	}
	if !strings.Contains(view, "Hello World") {
		t.Errorf("card view missing content; got: %s", view)
	}
}

func TestRenderList(t *testing.T) {
	g := NewGenerativeModel()
	g.width = 40
	g.SetData(map[string]any{
		"items": []any{"alpha", "beta", "gamma"},
	})
	g.SetSchema(A2UIComponent{
		Type:    "list",
		DataRef: "/items",
	})
	view := g.View()
	for _, item := range []string{"alpha", "beta", "gamma"} {
		if !strings.Contains(view, item) {
			t.Errorf("list view missing %q; got: %s", item, view)
		}
	}
}

func TestRenderProgress(t *testing.T) {
	out := renderProgress(0.65, 40)
	if !strings.Contains(out, "65%") {
		t.Errorf("progress missing '65%%'; got: %s", out)
	}
	if !strings.Contains(out, "█") {
		t.Errorf("progress missing filled blocks; got: %s", out)
	}
}

func TestRenderTable(t *testing.T) {
	rows := [][]string{
		{"Name", "Score"},
		{"Alice", "100"},
	}
	out := renderTable(rows)
	if !strings.Contains(out, "Alice") || !strings.Contains(out, "Score") {
		t.Errorf("table missing expected content; got: %s", out)
	}
}

func TestResolvePointerEscape(t *testing.T) {
	data := map[string]any{
		"a/b": "slash",
		"a~b": "tilde",
	}
	// RFC 6901: "~1" → "/" and "~0" → "~"
	if got := resolvePointer(data, "/a~1b"); got != "slash" {
		t.Errorf("tilde-escape ~1: expected 'slash', got %v", got)
	}
	if got := resolvePointer(data, "/a~0b"); got != "tilde" {
		t.Errorf("tilde-escape ~0: expected 'tilde', got %v", got)
	}
}
