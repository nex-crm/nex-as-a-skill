package tui

import (
	"strings"
	"testing"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/nex-ai/nex-cli/internal/agent"
	"github.com/nex-ai/nex-cli/internal/orchestration"
)

func newTestStreamModel() StreamModel {
	agentSvc := agent.NewAgentService()
	msgRouter := orchestration.NewMessageRouter()
	events := make(chan tea.Msg, 256)
	delegator := orchestration.NewDelegator(3)

	rt := &Runtime{
		AgentService:  agentSvc,
		MessageRouter: msgRouter,
		Delegator:     delegator,
		TeamLeadSlug:  "team-lead",
		PackSlug:      "founding-team",
		Events:        events,
	}

	m := NewStreamModel(rt, events)
	m.width = 120
	m.height = 40
	m.statusBar.Width = 120
	return m
}

// --- Slash command tests ---

func TestSlashHelp(t *testing.T) {
	m := newTestStreamModel()
	m.inputValue = []rune("/help")
	m.inputPos = 5

	m2, cmd := m.handleSubmit()
	if cmd != nil {
		t.Fatal("expected no cmd for /help")
	}

	found := false
	for _, msg := range m2.messages {
		if msg.Role == "system" && strings.Contains(msg.Content, "Available commands") {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected help output in messages")
	}
}

func TestSlashClear(t *testing.T) {
	m := newTestStreamModel()
	m.messages = append(m.messages, StreamMessage{
		Role: "user", Content: "hello", Timestamp: time.Now(),
	})
	m.inputValue = []rune("/clear")
	m.inputPos = 6

	m2, _ := m.handleSubmit()

	if len(m2.messages) != 1 {
		t.Fatalf("expected 1 message after clear, got %d", len(m2.messages))
	}
	if !strings.Contains(m2.messages[0].Content, "cleared") {
		t.Fatal("expected 'cleared' in message")
	}
}

func TestSlashQuit(t *testing.T) {
	m := newTestStreamModel()
	m.inputValue = []rune("/quit")
	m.inputPos = 5

	_, cmd := m.handleSubmit()
	if cmd == nil {
		t.Fatal("expected quit command")
	}
}

func TestSlashQ(t *testing.T) {
	m := newTestStreamModel()
	m.inputValue = []rune("/q")
	m.inputPos = 2

	_, cmd := m.handleSubmit()
	if cmd == nil {
		t.Fatal("expected quit command for /q")
	}
}

func TestSlashUnknown(t *testing.T) {
	m := newTestStreamModel()
	m.inputValue = []rune("/foobar")
	m.inputPos = 7

	m2, _ := m.handleSubmit()

	found := false
	for _, msg := range m2.messages {
		if msg.Role == "system" && strings.Contains(msg.Content, "Unknown command: /foobar") {
			found = true
		}
	}
	if !found {
		t.Fatal("expected unknown command message")
	}
}

// --- Submit routing test ---

func TestSubmitRoutesToAgent(t *testing.T) {
	m := newTestStreamModel()

	// Create and register team-lead
	_, _ = m.runtime.AgentService.CreateFromTemplate("team-lead", "team-lead")
	_ = m.runtime.AgentService.Start("team-lead")
	if tmpl, ok := m.runtime.AgentService.GetTemplate("team-lead"); ok {
		m.runtime.MessageRouter.RegisterAgent("team-lead", tmpl.Expertise)
	}

	m.inputValue = []rune("hello world")
	m.inputPos = 11

	m2, _ := m.handleSubmit()

	// Should have user message
	found := false
	for _, msg := range m2.messages {
		if msg.Role == "user" && msg.Content == "hello world" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected user message 'hello world' in stream")
	}

	if !m2.loading {
		t.Fatal("expected loading to be true after submit")
	}
}

func TestEmptySubmitDoesNothing(t *testing.T) {
	m := newTestStreamModel()
	m.inputValue = nil
	m.inputPos = 0

	initialCount := len(m.messages)
	m2, cmd := m.handleSubmit()

	if cmd != nil {
		t.Fatal("expected no cmd for empty submit")
	}
	if len(m2.messages) != initialCount {
		t.Fatal("expected no new messages for empty submit")
	}
}

// --- Message rendering tests ---

func TestViewContainsUserMessage(t *testing.T) {
	m := newTestStreamModel()
	m.messages = []StreamMessage{
		{Role: "user", Content: "hello", Timestamp: time.Now()},
	}

	view := m.View()
	if !strings.Contains(view, "You:") {
		t.Error("expected 'You:' in view")
	}
	if !strings.Contains(view, "hello") {
		t.Error("expected 'hello' in view")
	}
}

func TestViewContainsAgentMessage(t *testing.T) {
	m := newTestStreamModel()
	m.messages = []StreamMessage{
		{Role: "agent", AgentSlug: "team-lead", AgentName: "Team Lead", Content: "hi there", Timestamp: time.Now()},
	}

	view := m.View()
	if !strings.Contains(view, "Team Lead:") {
		t.Error("expected 'Team Lead:' in view")
	}
	if !strings.Contains(view, "hi there") {
		t.Error("expected 'hi there' in view")
	}
}

func TestViewContainsSystemMessage(t *testing.T) {
	m := newTestStreamModel()
	m.messages = []StreamMessage{
		{Role: "system", Content: "system msg", Timestamp: time.Now()},
	}

	view := m.View()
	if !strings.Contains(view, "system msg") {
		t.Error("expected 'system msg' in view")
	}
}

func TestViewShowsTitle(t *testing.T) {
	m := newTestStreamModel()
	view := m.View()
	if !strings.Contains(view, "nex v0.1.0") {
		t.Error("expected title 'nex v0.1.0' in view")
	}
}

func TestViewShowsRoster(t *testing.T) {
	m := newTestStreamModel()
	view := m.View()
	if !strings.Contains(view, "AGENTS") {
		t.Error("expected 'AGENTS' roster header in view")
	}
}

// --- Mode tests ---

func TestInitialModeIsInsert(t *testing.T) {
	m := newTestStreamModel()
	if m.mode != "insert" {
		t.Fatalf("expected initial mode 'insert', got %q", m.mode)
	}
	if m.statusBar.Mode != "INSERT" {
		t.Fatalf("expected status bar mode 'INSERT', got %q", m.statusBar.Mode)
	}
}

func TestWelcomeMessage(t *testing.T) {
	m := newTestStreamModel()
	if len(m.messages) == 0 {
		t.Fatal("expected welcome message")
	}
	if !strings.Contains(m.messages[0].Content, "Welcome") {
		t.Fatal("expected welcome message content")
	}
}

// --- Agent event tests ---

func TestAgentTextMsgUpdatesStreaming(t *testing.T) {
	m := newTestStreamModel()
	m2, _ := m.Update(AgentTextMsg{AgentSlug: "test-agent", Text: "hello "})

	if m2.streaming["test-agent"] != "hello " {
		t.Fatalf("expected streaming text 'hello ', got %q", m2.streaming["test-agent"])
	}

	m3, _ := m2.Update(AgentTextMsg{AgentSlug: "test-agent", Text: "world"})
	if m3.streaming["test-agent"] != "hello world" {
		t.Fatalf("expected streaming text 'hello world', got %q", m3.streaming["test-agent"])
	}
}

func TestAgentDoneMsgFinalizesMessage(t *testing.T) {
	m := newTestStreamModel()
	m.streaming["test-agent"] = "final text"

	// Need the agent in service for name lookup — create one
	_, _ = m.runtime.AgentService.CreateFromTemplate("team-lead", "team-lead")

	m2, _ := m.Update(AgentDoneMsg{AgentSlug: "test-agent"})

	// Streaming should be cleared
	if _, ok := m2.streaming["test-agent"]; ok {
		t.Fatal("expected streaming to be cleared after done")
	}

	// Should have finalized message
	found := false
	for _, msg := range m2.messages {
		if msg.Role == "agent" && msg.Content == "final text" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected finalized agent message")
	}
}
