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
	panesMode := flag.Bool("panes", false, "Use embedded multi-pane mode instead of channel view")
	packFlag := flag.String("pack", "", "Agent pack (founding-team, coding-team, lead-gen-agency)")
	channelView := flag.Bool("channel-view", false, "Run as channel view (used internally by nex team)")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Nex CLI v%s\n\n", version)
		fmt.Fprintf(os.Stderr, "Usage:\n")
		fmt.Fprintf(os.Stderr, "  nex              Interactive TUI (single agent)\n")
		fmt.Fprintf(os.Stderr, "  nex team         Launch multi-agent team in tmux\n")
		fmt.Fprintf(os.Stderr, "  nex team kill    Stop the running team\n")
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

	// Handle "nex team" subcommand
	args := flag.Args()
	if len(args) > 0 && args[0] == "team" {
		runTeam(args[1:], *packFlag)
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

	// Interactive mode (single agent TUI)
	p := tea.NewProgram(tui.NewModel(*panesMode), tea.WithAltScreen(), tea.WithMouseCellMotion())
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func runTeam(args []string, packSlug string) {
	// Handle "nex team kill"
	if len(args) > 0 && args[0] == "kill" {
		l, err := team.NewLauncher(packSlug)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}
		if err := l.Kill(); err != nil {
			fmt.Fprintf(os.Stderr, "error killing team: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Team session killed.")
		return
	}

	// Launch team
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

	fmt.Println("Team launched. Attaching to tmux session...")
	fmt.Println()
	fmt.Println("  Layout:")
	fmt.Println("    Window 0 'team': channel (left) + agent panes (right)")
	fmt.Printf("    Windows 1-%d: individual agent full-screen sessions\n", l.AgentCount())
	fmt.Println()
	fmt.Println("  Navigation:")
	fmt.Println("    Ctrl+B w         — window list")
	fmt.Println("    Ctrl+B 0         — team view (channel + agents)")
	fmt.Println("    Ctrl+B 1-7       — full-screen agent")
	fmt.Println("    Ctrl+B arrow     — switch pane within window")
	fmt.Println("    Ctrl+B d         — detach (agents keep running)")
	fmt.Println("    nex team kill    — stop everything")
	fmt.Println()

	if err := l.Attach(); err != nil {
		fmt.Fprintf(os.Stderr, "error attaching: %v\n", err)
		os.Exit(1)
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
