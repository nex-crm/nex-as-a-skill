package commands

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/nex-ai/nex-cli/internal/api"
)

// ErrQuit is returned by quit commands so the caller can signal clean exit.
var ErrQuit = errors.New("quit")

func cmdHelp(ctx *SlashContext, args string) error {
	help := "Available commands:\n\n" +
		"  AI:\n" +
		"    /ask <q>                   Ask the AI a question\n" +
		"    /search <q>                Search knowledge base\n" +
		"    /remember <txt>            Store information\n\n" +
		"  Objects:\n" +
		"    /object list|get|create|update|delete\n\n" +
		"  Records:\n" +
		"    /record list|get|create|upsert|update|delete|timeline\n\n" +
		"  Notes:\n" +
		"    /note list|get|create|update|delete\n\n" +
		"  Tasks:\n" +
		"    /task list|get|create|update|delete\n\n" +
		"  Relationships:\n" +
		"    /rel list-defs|create-def|delete-def|create|delete\n\n" +
		"  Attributes:\n" +
		"    /attribute create|update|delete\n\n" +
		"  Lists:\n" +
		"    /list list|get|create|delete|records|add-member|upsert-member|remove-record\n\n" +
		"  Agents:\n" +
		"    /agents                    List agents\n" +
		"    /agent <slug>              Agent details\n\n" +
		"  Config:\n" +
		"    /config show|set|path      Manage configuration\n" +
		"    /detect                    Detect installed AI platforms\n\n" +
		"  System:\n" +
		"    /help                      Show this help\n" +
		"    /clear                     Clear messages\n" +
		"    /quit                      Exit nex\n" +
		"    /init                      Run setup\n" +
		"    /provider                  Switch LLM provider"
	ctx.AddMessage("system", help)
	return nil
}

func cmdClear(ctx *SlashContext, args string) error {
	ctx.AddMessage("system", "Messages cleared.")
	return nil
}

func cmdQuit(ctx *SlashContext, args string) error {
	return ErrQuit
}

func cmdInit(ctx *SlashContext, args string) error {
	ctx.AddMessage("system", "Starting setup — follow the prompts to configure your environment.")
	return nil
}

func cmdProvider(ctx *SlashContext, args string) error {
	options := []PickerOption{
		{Label: "Gemini", Value: "gemini", Description: "Google Gemini via API key"},
		{Label: "Claude Code", Value: "claude-code", Description: "Claude via claude-code CLI"},
		{Label: "Nex Ask", Value: "nex-ask", Description: "Nex hosted AI"},
	}
	if ctx.ShowPicker != nil {
		ctx.ShowPicker("Switch LLM Provider", options)
		return nil
	}
	var sb strings.Builder
	sb.WriteString("LLM providers:\n")
	for _, opt := range options {
		sb.WriteString(fmt.Sprintf("  • %s — %s\n", opt.Label, opt.Description))
	}
	ctx.AddMessage("system", strings.TrimRight(sb.String(), "\n"))
	return nil
}

func cmdGraph(ctx *SlashContext, args string) error {
	if !requireAuth(ctx) {
		return nil
	}
	ctx.SetLoading(true)
	result, err := api.Get[[]map[string]any](ctx.APIClient, "/v1/graph?limit=50", 0)
	ctx.SetLoading(false)
	if err != nil {
		return err
	}
	if len(result) == 0 {
		ctx.AddMessage("system", "No graph data found.")
		return nil
	}
	b, _ := json.MarshalIndent(result, "", "  ")
	ctx.AddMessage("system", string(b))
	return nil
}

func cmdInsights(ctx *SlashContext, args string) error {
	if !requireAuth(ctx) {
		return nil
	}
	ctx.SetLoading(true)
	result, err := api.Get[[]map[string]any](ctx.APIClient, "/v1/insights?limit=10", 0)
	ctx.SetLoading(false)
	if err != nil {
		return err
	}
	if len(result) == 0 {
		ctx.AddMessage("system", "No insights found.")
		return nil
	}
	b, _ := json.MarshalIndent(result, "", "  ")
	ctx.AddMessage("system", string(b))
	return nil
}

// --- shared helpers ---

func requireAuth(ctx *SlashContext) bool {
	if ctx.APIClient == nil || !ctx.APIClient.IsAuthenticated() {
		ctx.AddMessage("system", "Not authenticated. Run /init to set up.")
		return false
	}
	return true
}

func formatMapResult(m map[string]any) string {
	for _, key := range []string{"answer", "message", "result", "text"} {
		if v, ok := m[key].(string); ok && v != "" {
			return v
		}
	}
	b, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return fmt.Sprintf("%v", m)
	}
	return string(b)
}
