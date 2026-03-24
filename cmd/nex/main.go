package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"
	"strings"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/nex-ai/nex-cli/internal/commands"
	"github.com/nex-ai/nex-cli/internal/config"
	"github.com/nex-ai/nex-cli/internal/team"
	"github.com/nex-ai/nex-cli/internal/tui"
)

const version = "0.1.0"

func main() {
	cmd := flag.String("cmd", "", "Run a command non-interactively")
	format := flag.String("format", "text", "Output format (text, json)")
	apiKeyFlag := flag.String("api-key", "", "API key for authentication")
	showVersion := flag.Bool("version", false, "Print version and exit")
	soloMode := flag.Bool("solo", false, "Single-agent TUI (no team)")
	packFlag := flag.String("pack", "", "Agent pack (founding-team, coding-team, lead-gen-agency)")
	channelView := flag.Bool("channel-view", false, "Run as channel view (internal)")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Nex CLI v%s\n\n", version)
		fmt.Fprintf(os.Stderr, "Usage:\n")
		fmt.Fprintf(os.Stderr, "  nex              Launch multi-agent team\n")
		fmt.Fprintf(os.Stderr, "  nex kill         Stop the running team\n")
		fmt.Fprintf(os.Stderr, "  nex --solo       Single-agent TUI (no team)\n")
		fmt.Fprintf(os.Stderr, "  nex --cmd <cmd>  Run a command non-interactively\n")
		fmt.Fprintf(os.Stderr, "\nFlags:\n")
		flag.PrintDefaults()
	}

	flag.Parse()

	if *showVersion {
		fmt.Printf("nex v%s\n", version)
		os.Exit(0)
	}

	// Channel view mode (launched by nex team as tmux window 0)
	if *channelView {
		runChannelView()
		return
	}

	// Handle "nex kill" subcommand
	args := flag.Args()
	if len(args) > 0 && args[0] == "kill" {
		l, err := team.NewLauncher(*packFlag)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}
		if err := l.Kill(); err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Team session killed.")
		return
	}

	// Non-interactive: --cmd flag
	if *cmd != "" {
		dispatch(*cmd, *apiKeyFlag, *format)
		return
	}

	// Non-interactive: piped stdin
	if isPiped() {
		scanner := bufio.NewScanner(os.Stdin)
		for scanner.Scan() {
			dispatch(scanner.Text(), *apiKeyFlag, *format)
		}
		if err := scanner.Err(); err != nil {
			fmt.Fprintf(os.Stderr, "error reading stdin: %v\n", err)
			os.Exit(1)
		}
		return
	}

	// Solo mode: single-agent TUI
	if *soloMode {
		p := tea.NewProgram(tui.NewModel(false), tea.WithAltScreen(), tea.WithMouseCellMotion())
		if _, err := p.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}
		return
	}

	// Default: launch multi-agent team
	runTeam(nil, *packFlag)
}

func runTeam(args []string, packSlug string) {
	l, err := team.NewLauncher(packSlug)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	if err := l.Preflight(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Launching %s (%d agents)...\n", l.PackName(), l.AgentCount())

	if err := l.Launch(); err != nil {
		fmt.Fprintf(os.Stderr, "error launching team: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Team launched. Attaching...")
	fmt.Println()
	fmt.Println("  Ctrl+B 0         channel + agent panes")
	fmt.Printf("  Ctrl+B 1-%d       full-screen agent\n", l.AgentCount())
	fmt.Println("  Ctrl+B arrow     switch pane")
	fmt.Println("  Ctrl+B d         detach (keeps running)")
	fmt.Println("  /quit            exit everything")
	fmt.Println("  nex kill         stop from outside")
	fmt.Println()

	if err := l.Attach(); err != nil {
		// Attach failed (not a terminal, or tmux error).
		// Keep the process alive to maintain the broker.
		fmt.Fprintf(os.Stderr, "Could not attach to tmux (not a terminal?).\n")
		fmt.Fprintf(os.Stderr, "Team is running in background. Attach manually:\n")
		fmt.Fprintf(os.Stderr, "  tmux -L nex attach -t nex-team\n")
		fmt.Fprintf(os.Stderr, "Broker running on http://127.0.0.1:7890\n")
		fmt.Fprintf(os.Stderr, "Press Ctrl+C to stop.\n")
		// Block forever — broker + notification loop stay alive
		select {}
	}
}

func dispatch(cmd string, apiKeyFlag string, format string) {
	apiKey := config.ResolveAPIKey(apiKeyFlag)
	if apiKey == "" {
		fmt.Fprintf(os.Stderr, "No API key found. Set NEX_API_KEY or run: nex (interactive) then /init\n")
		os.Exit(2)
	}

	result := commands.Dispatch(cmd, apiKey, format, 0)
	if result.Error != "" {
		fmt.Fprintf(os.Stderr, "error: %s\n", result.Error)
		if strings.Contains(result.Error, "401") || strings.Contains(result.Error, "auth") {
			os.Exit(2)
		}
		os.Exit(1)
	}
	if result.Output != "" {
		fmt.Println(result.Output)
	}
}

func isPiped() bool {
	info, err := os.Stdin.Stat()
	if err != nil {
		return false
	}
	return info.Mode()&os.ModeCharDevice == 0
}
