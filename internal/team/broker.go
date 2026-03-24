package team

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const BrokerPort = 7890

var brokerStatePath = defaultBrokerStatePath

type channelMessage struct {
	ID        string   `json:"id"`
	From      string   `json:"from"`
	Content   string   `json:"content"`
	Tagged    []string `json:"tagged"`
	ReplyTo   string   `json:"reply_to,omitempty"`
	Timestamp string   `json:"timestamp"`
}

type interviewOption struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

type interviewAnswer struct {
	ChoiceID   string `json:"choice_id,omitempty"`
	ChoiceText string `json:"choice_text,omitempty"`
	CustomText string `json:"custom_text,omitempty"`
	AnsweredAt string `json:"answered_at,omitempty"`
}

type humanInterview struct {
	ID            string            `json:"id"`
	From          string            `json:"from"`
	Question      string            `json:"question"`
	Context       string            `json:"context,omitempty"`
	Options       []interviewOption `json:"options,omitempty"`
	RecommendedID string            `json:"recommended_id,omitempty"`
	CreatedAt     string            `json:"created_at"`
	Answered      *interviewAnswer  `json:"answered,omitempty"`
}

type brokerState struct {
	Messages         []channelMessage `json:"messages"`
	Counter          int              `json:"counter"`
	PendingInterview *humanInterview  `json:"pending_interview,omitempty"`
}

// Broker is a lightweight HTTP message broker for the team channel.
// All agent MCP instances connect to this shared broker.
type Broker struct {
	messages         []channelMessage
	counter          int
	pendingInterview *humanInterview
	mu               sync.Mutex
	server           *http.Server
}

// NewBroker creates a new channel broker.
func NewBroker() *Broker {
	b := &Broker{}
	_ = b.loadState()
	return b
}

// Start launches the broker on localhost:7890.
func (b *Broker) Start() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", b.handleHealth)
	mux.HandleFunc("/messages", b.handleMessages)
	mux.HandleFunc("/members", b.handleMembers)
	mux.HandleFunc("/interview", b.handleInterview)
	mux.HandleFunc("/interview/answer", b.handleInterviewAnswer)
	mux.HandleFunc("/reset", b.handleReset)

	addr := fmt.Sprintf("127.0.0.1:%d", BrokerPort)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}

	b.server = &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 5 * time.Second,
	}

	go func() {
		_ = b.server.Serve(ln)
	}()
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

func (b *Broker) HasPendingInterview() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.pendingInterview != nil && b.pendingInterview.Answered == nil
}

func (b *Broker) Reset() {
	b.mu.Lock()
	b.messages = nil
	b.pendingInterview = nil
	b.counter = 0
	_ = b.saveLocked()
	b.mu.Unlock()
}

func defaultBrokerStatePath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".nex-cli", "team", "broker-state.json")
	}
	return filepath.Join(home, ".nex-cli", "team", "broker-state.json")
}

func (b *Broker) loadState() error {
	path := brokerStatePath()
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	var state brokerState
	if err := json.Unmarshal(data, &state); err != nil {
		return err
	}
	b.messages = state.Messages
	b.counter = state.Counter
	b.pendingInterview = state.PendingInterview
	return nil
}

func (b *Broker) saveLocked() error {
	path := brokerStatePath()
	if len(b.messages) == 0 && b.pendingInterview == nil && b.counter == 0 {
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	state := brokerState{
		Messages:         b.messages,
		Counter:          b.counter,
		PendingInterview: b.pendingInterview,
	}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (b *Broker) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

func (b *Broker) handleReset(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	b.Reset()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"ok": true})
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
		ReplyTo string   `json:"reply_to"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	b.mu.Lock()
	if b.pendingInterview != nil && b.pendingInterview.Answered == nil {
		b.mu.Unlock()
		http.Error(w, "interview pending; answer required before chat resumes", http.StatusConflict)
		return
	}

	b.counter++
	msg := channelMessage{
		ID:        fmt.Sprintf("msg-%d", b.counter),
		From:      body.From,
		Content:   body.Content,
		Tagged:    body.Tagged,
		ReplyTo:   strings.TrimSpace(body.ReplyTo),
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	b.messages = append(b.messages, msg)
	total := len(b.messages)
	if err := b.saveLocked(); err != nil {
		b.mu.Unlock()
		http.Error(w, "failed to persist broker state", http.StatusInternalServerError)
		return
	}
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

func (b *Broker) handleInterview(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		b.handleGetInterview(w, r)
	case http.MethodPost:
		b.handlePostInterview(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (b *Broker) handlePostInterview(w http.ResponseWriter, r *http.Request) {
	var body struct {
		From          string            `json:"from"`
		Question      string            `json:"question"`
		Context       string            `json:"context"`
		Options       []interviewOption `json:"options"`
		RecommendedID string            `json:"recommended_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(body.From) == "" || strings.TrimSpace(body.Question) == "" {
		http.Error(w, "from and question required", http.StatusBadRequest)
		return
	}

	b.mu.Lock()
	b.counter++
	id := fmt.Sprintf("interview-%d", b.counter)
	b.pendingInterview = &humanInterview{
		ID:            id,
		From:          body.From,
		Question:      body.Question,
		Context:       body.Context,
		Options:       body.Options,
		RecommendedID: body.RecommendedID,
		CreatedAt:     time.Now().UTC().Format(time.RFC3339),
	}
	if err := b.saveLocked(); err != nil {
		b.mu.Unlock()
		http.Error(w, "failed to persist broker state", http.StatusInternalServerError)
		return
	}
	b.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"id": id,
	})
}

func (b *Broker) handleGetInterview(w http.ResponseWriter, r *http.Request) {
	b.mu.Lock()
	defer b.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	if b.pendingInterview == nil || b.pendingInterview.Answered != nil {
		json.NewEncoder(w).Encode(map[string]any{"pending": nil})
		return
	}
	json.NewEncoder(w).Encode(map[string]any{"pending": b.pendingInterview})
}

func (b *Broker) handleInterviewAnswer(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		b.handleGetInterviewAnswer(w, r)
	case http.MethodPost:
		b.handlePostInterviewAnswer(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (b *Broker) handleGetInterviewAnswer(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	b.mu.Lock()
	defer b.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	if b.pendingInterview == nil || b.pendingInterview.ID != id || b.pendingInterview.Answered == nil {
		json.NewEncoder(w).Encode(map[string]any{"answered": nil})
		return
	}
	json.NewEncoder(w).Encode(map[string]any{"answered": b.pendingInterview.Answered})
}

func (b *Broker) handlePostInterviewAnswer(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID         string `json:"id"`
		ChoiceID   string `json:"choice_id"`
		ChoiceText string `json:"choice_text"`
		CustomText string `json:"custom_text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	b.mu.Lock()
	if b.pendingInterview == nil || b.pendingInterview.ID != body.ID {
		b.mu.Unlock()
		http.Error(w, "interview not found", http.StatusNotFound)
		return
	}
	answer := &interviewAnswer{
		ChoiceID:   body.ChoiceID,
		ChoiceText: body.ChoiceText,
		CustomText: body.CustomText,
		AnsweredAt: time.Now().UTC().Format(time.RFC3339),
	}
	b.pendingInterview.Answered = answer
	b.counter++
	msg := channelMessage{
		ID:   fmt.Sprintf("msg-%d", b.counter),
		From: "you",
		Tagged: []string{
			b.pendingInterview.From,
		},
		ReplyTo:   "",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	switch {
	case strings.TrimSpace(body.CustomText) != "":
		msg.Content = fmt.Sprintf("Answered @%s's question: %s", b.pendingInterview.From, body.CustomText)
	case strings.TrimSpace(body.ChoiceText) != "":
		msg.Content = fmt.Sprintf("Answered @%s's question: %s", b.pendingInterview.From, body.ChoiceText)
	default:
		msg.Content = fmt.Sprintf("Answered @%s's question.", b.pendingInterview.From)
	}
	b.messages = append(b.messages, msg)
	if err := b.saveLocked(); err != nil {
		b.mu.Unlock()
		http.Error(w, "failed to persist broker state", http.StatusInternalServerError)
		return
	}
	b.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"ok": true})
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
			thread := ""
			if m.ReplyTo != "" {
				thread = fmt.Sprintf(" ↳ %s", m.ReplyTo)
			}
			sb.WriteString(fmt.Sprintf("  %s%s  @%s: %s\n", ts, thread, prefix, m.Content))
		}
	}
	return sb.String()
}
