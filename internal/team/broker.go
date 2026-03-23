package team

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

const BrokerPort = 7890

type channelMessage struct {
	ID        string   `json:"id"`
	From      string   `json:"from"`
	Content   string   `json:"content"`
	Tagged    []string `json:"tagged"`
	Timestamp string   `json:"timestamp"`
}

// Broker is a lightweight HTTP message broker for the team channel.
// All agent MCP instances connect to this shared broker.
type Broker struct {
	messages []channelMessage
	counter  int
	mu       sync.Mutex
	server   *http.Server
}

// NewBroker creates a new channel broker.
func NewBroker() *Broker {
	return &Broker{}
}

// Start launches the broker on localhost:7890.
func (b *Broker) Start() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", b.handleHealth)
	mux.HandleFunc("/messages", b.handleMessages)
	mux.HandleFunc("/members", b.handleMembers)

	b.server = &http.Server{
		Addr:         fmt.Sprintf("127.0.0.1:%d", BrokerPort),
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 5 * time.Second,
	}

	go b.server.ListenAndServe()
	return nil
}

// Stop shuts down the broker.
func (b *Broker) Stop() {
	if b.server != nil {
		b.server.Close()
	}
}

// Messages returns all channel messages (for the Go TUI channel view).
func (b *Broker) Messages() []channelMessage {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make([]channelMessage, len(b.messages))
	copy(out, b.messages)
	return out
}

func (b *Broker) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

func (b *Broker) handleMessages(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		b.handlePostMessage(w, r)
	case http.MethodGet:
		b.handleGetMessages(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (b *Broker) handlePostMessage(w http.ResponseWriter, r *http.Request) {
	var body struct {
		From    string   `json:"from"`
		Content string   `json:"content"`
		Tagged  []string `json:"tagged"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	b.mu.Lock()
	b.counter++
	msg := channelMessage{
		ID:        fmt.Sprintf("msg-%d", b.counter),
		From:      body.From,
		Content:   body.Content,
		Tagged:    body.Tagged,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	b.messages = append(b.messages, msg)
	total := len(b.messages)
	b.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"id":    msg.ID,
		"total": total,
	})
}

func (b *Broker) handleGetMessages(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit := 20
	if l, err := strconv.Atoi(q.Get("limit")); err == nil && l > 0 {
		limit = l
	}
	if limit > 100 {
		limit = 100
	}

	sinceID := q.Get("since_id")
	mySlug := q.Get("my_slug")

	b.mu.Lock()
	messages := b.messages
	if sinceID != "" {
		for i, m := range messages {
			if m.ID == sinceID {
				messages = messages[i+1:]
				break
			}
		}
	}
	if len(messages) > limit {
		messages = messages[len(messages)-limit:]
	}
	// Copy to avoid race
	result := make([]channelMessage, len(messages))
	copy(result, messages)
	b.mu.Unlock()

	taggedCount := 0
	if mySlug != "" {
		for _, m := range result {
			for _, t := range m.Tagged {
				if t == mySlug {
					taggedCount++
					break
				}
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"messages":     result,
		"tagged_count": taggedCount,
	})
}

func (b *Broker) handleMembers(w http.ResponseWriter, r *http.Request) {
	b.mu.Lock()
	members := make(map[string]struct{ lastMessage, lastTime string })
	for _, msg := range b.messages {
		content := msg.Content
		if len(content) > 80 {
			content = content[:80]
		}
		ts := msg.Timestamp
		if len(ts) > 19 {
			ts = ts[11:19]
		}
		members[msg.From] = struct{ lastMessage, lastTime string }{content, ts}
	}
	b.mu.Unlock()

	type memberEntry struct {
		Slug        string `json:"slug"`
		LastMessage string `json:"lastMessage"`
		LastTime    string `json:"lastTime"`
	}

	var list []memberEntry
	for slug, info := range members {
		list = append(list, memberEntry{
			Slug:        slug,
			LastMessage: info.lastMessage,
			LastTime:    info.lastTime,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"members": list})
}

// FormatChannelView returns a clean, Slack-style rendering of recent messages.
func FormatChannelView(messages []channelMessage) string {
	if len(messages) == 0 {
		return "  No messages yet. The team is getting set up..."
	}

	var sb strings.Builder
	for _, m := range messages {
		ts := m.Timestamp
		if len(ts) > 19 {
			ts = ts[11:19]
		}

		prefix := m.From
		if strings.HasPrefix(m.Content, "[STATUS]") {
			sb.WriteString(fmt.Sprintf("  %s  @%s %s\n", ts, prefix, m.Content))
		} else {
			sb.WriteString(fmt.Sprintf("  %s  @%s: %s\n", ts, prefix, m.Content))
		}
	}
	return sb.String()
}
