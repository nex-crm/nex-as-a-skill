package team

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestFormatChannelViewIncludesThreadReference(t *testing.T) {
	got := FormatChannelView([]channelMessage{
		{ID: "msg-1", From: "ceo", Content: "Root topic", Timestamp: "2026-03-24T10:00:00Z"},
		{ID: "msg-2", From: "fe", Content: "Replying here", ReplyTo: "msg-1", Timestamp: "2026-03-24T10:01:00Z"},
	})

	if !strings.Contains(got, "10:01:00 ↳ msg-1  @fe: Replying here") {
		t.Fatalf("expected threaded message to include reply marker, got %q", got)
	}
}

func TestBrokerPersistsAndReloadsState(t *testing.T) {
	oldPathFn := brokerStatePath
	tmpDir := t.TempDir()
	brokerStatePath = func() string { return filepath.Join(tmpDir, "broker-state.json") }
	defer func() { brokerStatePath = oldPathFn }()

	b := NewBroker()
	b.mu.Lock()
	b.messages = []channelMessage{{ID: "msg-1", From: "ceo", Content: "Persist me", Timestamp: "2026-03-24T10:00:00Z"}}
	b.counter = 1
	if err := b.saveLocked(); err != nil {
		b.mu.Unlock()
		t.Fatalf("saveLocked failed: %v", err)
	}
	b.mu.Unlock()

	reloaded := NewBroker()
	msgs := reloaded.Messages()
	if len(msgs) != 1 {
		t.Fatalf("expected 1 persisted message, got %d", len(msgs))
	}
	if msgs[0].Content != "Persist me" {
		t.Fatalf("expected persisted content, got %q", msgs[0].Content)
	}

	reloaded.Reset()
	empty := NewBroker()
	if len(empty.Messages()) != 0 {
		t.Fatalf("expected reset to clear persisted messages, got %d", len(empty.Messages()))
	}
}
