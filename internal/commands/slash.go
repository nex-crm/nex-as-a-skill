package commands

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
