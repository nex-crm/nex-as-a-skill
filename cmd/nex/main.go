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
	"github.com/nex-ai/nex-cli/internal/tui"
)

const version = "0.1.0"

func main() {
	cmd := flag.String("cmd", "", "Run a command non-interactively")
	format := flag.String("format", "text", "Output format (text, json)")
	apiKeyFlag := flag.String("api-key", "", "API key for authentication")
	showVersion := flag.Bool("version", false, "Print version and exit")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Nex CLI v%s\n\n", version)
		fmt.Fprintf(os.Stderr, "Usage: nex [flags]\n\n")
		fmt.Fprintf(os.Stderr, "Flags:\n")
		flag.PrintDefaults()
	}

	flag.Parse()

	if *showVersion {
		fmt.Printf("nex v%s\n", version)
		os.Exit(0)
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

	// Interactive mode
	p := tea.NewProgram(tui.NewModel(), tea.WithAltScreen(), tea.WithMouseCellMotion())
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
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
