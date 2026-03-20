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

// RegisterAllCommands populates r with the full set of nex slash commands.
func RegisterAllCommands(r *Registry) {
	// AI
	r.Register(SlashCommand{Name: "ask", Description: "Ask the AI a question", Execute: cmdAsk})
	r.Register(SlashCommand{Name: "search", Description: "Search knowledge base", Execute: cmdSearch})
	r.Register(SlashCommand{Name: "remember", Description: "Store information", Execute: cmdRemember})

	// Navigation
	r.Register(SlashCommand{Name: "chat", Description: "Switch to chat view"})
	r.Register(SlashCommand{Name: "calendar", Description: "View calendar"})
	r.Register(SlashCommand{Name: "orchestration", Description: "View orchestration"})
	r.Register(SlashCommand{Name: "orch", Description: "View orchestration (alias)"})
	r.Register(SlashCommand{Name: "cal", Description: "View calendar (alias)"})

	// Agents
	r.Register(SlashCommand{Name: "agents", Description: "List agents", Execute: cmdAgents})
	r.Register(SlashCommand{Name: "agent", Description: "Agent details", Execute: cmdAgent})

	// Data
	r.Register(SlashCommand{Name: "objects", Description: "List object types", Execute: cmdObjects})
	r.Register(SlashCommand{Name: "records", Description: "List records", Execute: cmdRecords})
	r.Register(SlashCommand{Name: "graph", Description: "View context graph", Execute: cmdGraph})
	r.Register(SlashCommand{Name: "insights", Description: "View insights", Execute: cmdInsights})

	// System
	r.Register(SlashCommand{Name: "help", Description: "Show help", Execute: cmdHelp})
	r.Register(SlashCommand{Name: "clear", Description: "Clear messages", Execute: cmdClear})
	r.Register(SlashCommand{Name: "quit", Description: "Exit", Execute: cmdQuit})
	r.Register(SlashCommand{Name: "q", Description: "Exit (alias)", Execute: cmdQuit})
	r.Register(SlashCommand{Name: "init", Description: "Run setup", Execute: cmdInit})
	r.Register(SlashCommand{Name: "login", Description: "Login with email"})
	r.Register(SlashCommand{Name: "provider", Description: "Switch LLM provider", Execute: cmdProvider})
}

// --- AI commands ---

func cmdAsk(ctx *SlashContext, args string) error {
	if args == "" {
		ctx.AddMessage("system", "Usage: /ask <question>")
		return nil
	}
	if !requireAuth(ctx) {
		return nil
	}
	ctx.SetLoading(true)
	result, err := api.Post[map[string]any](ctx.APIClient, "/v1/context/ask", map[string]any{"query": args}, 0)
	ctx.SetLoading(false)
	if err != nil {
		return err
	}
	ctx.AddMessage("agent", formatMapResult(result))
	return nil
}

func cmdSearch(ctx *SlashContext, args string) error {
	if args == "" {
		ctx.AddMessage("system", "Usage: /search <query>")
		return nil
	}
	if !requireAuth(ctx) {
		return nil
	}
	ctx.SetLoading(true)
	result, err := api.Post[map[string]any](ctx.APIClient, "/v1/search", map[string]any{"query": args}, 0)
	ctx.SetLoading(false)
	if err != nil {
		return err
	}
	ctx.AddMessage("system", formatMapResult(result))
	return nil
}

func cmdRemember(ctx *SlashContext, args string) error {
	if args == "" {
		ctx.AddMessage("system", "Usage: /remember <content>")
		return nil
	}
	if !requireAuth(ctx) {
		return nil
	}
	ctx.SetLoading(true)
	_, err := api.Post[map[string]any](ctx.APIClient, "/v1/context/text", map[string]any{"content": args}, 0)
	ctx.SetLoading(false)
	if err != nil {
		return err
	}
	ctx.AddMessage("system", "Stored.")
	return nil
}

// --- Agent commands ---

func cmdAgents(ctx *SlashContext, args string) error {
	if ctx.AgentService == nil {
		ctx.AddMessage("system", "Agent service not available.")
		return nil
	}
	agents := ctx.AgentService.List()
	if len(agents) == 0 {
		ctx.AddMessage("system", "No agents running.")
		return nil
	}
	var sb strings.Builder
	sb.WriteString("Active agents:\n")
	for _, a := range agents {
		sb.WriteString(fmt.Sprintf("  • %s (%s) — %s\n", a.Config.Name, a.Config.Slug, a.State.Phase))
	}
	ctx.AddMessage("system", strings.TrimRight(sb.String(), "\n"))
	return nil
}

func cmdAgent(ctx *SlashContext, args string) error {
	if args == "" {
		ctx.AddMessage("system", "Usage: /agent <slug>")
		return nil
	}
	if ctx.AgentService == nil {
		ctx.AddMessage("system", "Agent service not available.")
		return nil
	}
	ma, ok := ctx.AgentService.Get(args)
	if !ok {
		ctx.AddMessage("system", fmt.Sprintf("Agent %q not found.", args))
		return nil
	}
	info := fmt.Sprintf(
		"Agent: %s\nSlug:  %s\nPhase: %s\nExpertise: %s",
		ma.Config.Name, ma.Config.Slug, ma.State.Phase,
		strings.Join(ma.Config.Expertise, ", "),
	)
	ctx.AddMessage("system", info)
	return nil
}

// --- Data commands ---

func cmdObjects(ctx *SlashContext, args string) error {
	if !requireAuth(ctx) {
		return nil
	}
	ctx.SetLoading(true)
	result, err := api.Get[[]map[string]any](ctx.APIClient, "/v1/objects", 0)
	ctx.SetLoading(false)
	if err != nil {
		return err
	}
	if len(result) == 0 {
		ctx.AddMessage("system", "No object types found.")
		return nil
	}
	var sb strings.Builder
	sb.WriteString("Object types:\n")
	for _, obj := range result {
		name, _ := obj["name"].(string)
		sb.WriteString("  • " + name + "\n")
	}
	ctx.AddMessage("system", strings.TrimRight(sb.String(), "\n"))
	return nil
}

func cmdRecords(ctx *SlashContext, args string) error {
	if args == "" {
		ctx.AddMessage("system", "Usage: /records <objectType>")
		return nil
	}
	if !requireAuth(ctx) {
		return nil
	}
	ctx.SetLoading(true)
	result, err := api.Get[[]map[string]any](ctx.APIClient, "/v1/records?object_type="+args, 0)
	ctx.SetLoading(false)
	if err != nil {
		return err
	}
	if len(result) == 0 {
		ctx.AddMessage("system", "No records found.")
		return nil
	}
	b, _ := json.MarshalIndent(result, "", "  ")
	ctx.AddMessage("system", string(b))
	return nil
}

func cmdGraph(ctx *SlashContext, args string) error {
	ctx.AddMessage("system", "Context graph — coming soon.")
	return nil
}

func cmdInsights(ctx *SlashContext, args string) error {
	ctx.AddMessage("system", "Insights — coming soon.")
	return nil
}

// --- System commands ---

func cmdHelp(ctx *SlashContext, args string) error {
	// Build help from the registry populated in the context.
	// Since we don't have a registry ref here, emit the known commands.
	help := "Available commands:\n" +
		"  /ask <q>         Ask the AI a question\n" +
		"  /search <q>      Search knowledge base\n" +
		"  /remember <txt>  Store information\n" +
		"  /agents          List agents\n" +
		"  /agent <slug>    Agent details\n" +
		"  /objects         List object types\n" +
		"  /records <type>  List records\n" +
		"  /graph           View context graph\n" +
		"  /insights        View insights\n" +
		"  /provider        Switch LLM provider\n" +
		"  /init            Run setup\n" +
		"  /clear           Clear messages\n" +
		"  /quit            Exit nex"
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
	ctx.AddMessage("system", "Run /init to set up — coming in next update.")
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
	// Non-interactive fallback
	var sb strings.Builder
	sb.WriteString("LLM providers:\n")
	for _, opt := range options {
		sb.WriteString(fmt.Sprintf("  • %s — %s\n", opt.Label, opt.Description))
	}
	ctx.AddMessage("system", strings.TrimRight(sb.String(), "\n"))
	return nil
}

// --- helpers ---

func requireAuth(ctx *SlashContext) bool {
	if ctx.APIClient == nil || !ctx.APIClient.IsAuthenticated() {
		ctx.AddMessage("system", "Not authenticated. Run /init to set up.")
		return false
	}
	return true
}

func formatMapResult(m map[string]any) string {
	// Prefer a top-level "answer", "message", or "result" string field.
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
