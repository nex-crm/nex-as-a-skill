// Package team implements the "nex team" command that launches a multi-agent
// collaborative team using tmux + claude-peers-mcp + Nex plugin.
//
// Architecture:
//   - Each agent is a real Claude Code session in a tmux window
//   - claude-peers-mcp provides the shared channel (all agents see all messages)
//   - Nex plugin provides persistent context across sessions
//   - CEO has final decision authority; agents participate when relevant
//   - Go TUI is the channel "observer" — displays the conversation
package team

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/nex-ai/nex-cli/internal/agent"
	"github.com/nex-ai/nex-cli/internal/config"
)

const (
	SessionName = "nex-team"
)

// Launcher sets up and manages the multi-agent team.
type Launcher struct {
	packSlug    string
	pack        *agent.PackDefinition
	sessionName string
	cwd         string
	broker      *Broker
	mcpConfig   string
}

// NewLauncher creates a launcher for the given pack.
func NewLauncher(packSlug string) (*Launcher, error) {
	if packSlug == "" {
		cfg, _ := config.Load()
		packSlug = cfg.Pack
		if packSlug == "" {
			packSlug = "founding-team"
		}
	}

	pack := agent.GetPack(packSlug)
	if pack == nil {
		return nil, fmt.Errorf("unknown pack: %s", packSlug)
	}

	cwd, err := os.Getwd()
	if err != nil {
		return nil, err
	}

	return &Launcher{
		packSlug:    packSlug,
		pack:        pack,
		sessionName: SessionName,
		cwd:         cwd,
	}, nil
}

// Preflight checks that required tools are available.
func (l *Launcher) Preflight() error {
	if _, err := exec.LookPath("tmux"); err != nil {
		return fmt.Errorf("tmux not found. Install: brew install tmux")
	}
	if _, err := exec.LookPath("claude"); err != nil {
		return fmt.Errorf("claude not found. Install: npm install -g @anthropic-ai/claude-code")
	}
	if _, err := exec.LookPath("bun"); err != nil {
		return fmt.Errorf("bun not found. Install: curl -fsSL https://bun.sh/install | bash")
	}
	return nil
}

// Launch creates the tmux session with:
//   - Window 0 "team": Channel on left, agent panes on the right
//   - No extra windows: all team activity is visible in one place
func (l *Launcher) Launch() error {
	if err := l.ensureMCPRuntime(); err != nil {
		return fmt.Errorf("prepare mcp runtime: %w", err)
	}
	mcpConfig, err := l.ensureMCPConfig()
	if err != nil {
		return fmt.Errorf("prepare mcp config: %w", err)
	}
	l.mcpConfig = mcpConfig

	// Start the shared channel broker
	l.broker = NewBroker()
	if err := l.broker.Start(); err != nil {
		return fmt.Errorf("start broker: %w", err)
	}

	// Kill any existing session
	exec.Command("tmux", "-L", "nex", "kill-session", "-t", l.sessionName).Run()

	// Resolve nex binary path for the channel view
	nexBinary, _ := os.Executable()

	// Window 0 "team": channel on the left
	channelCmd := fmt.Sprintf("%s --channel-view", nexBinary)
	err = exec.Command("tmux", "-L", "nex", "new-session", "-d",
		"-s", l.sessionName,
		"-n", "team",
		"-c", l.cwd,
		channelCmd,
	).Run()
	if err != nil {
		return fmt.Errorf("create tmux session: %w", err)
	}

	// Split right: leader gets the main visible agent pane.
	leaderPrompt := l.buildPrompt(l.pack.LeadSlug)
	leaderCmd := l.claudeCommand(l.pack.LeadSlug, leaderPrompt)

	exec.Command("tmux", "-L", "nex", "split-window", "-h",
		"-t", l.sessionName+":team",
		"-p", "58",
		"-c", l.cwd,
		leaderCmd,
	).Run()

	// Add a few key specialists in visible panes so the channel stays readable.
	visibleSlugs := []string{l.pack.LeadSlug}
	specialists := 0
	for _, agentCfg := range l.pack.Agents {
		if agentCfg.Slug == l.pack.LeadSlug {
			continue
		}
		if specialists >= 4 {
			break
		}

		prompt := l.buildPrompt(agentCfg.Slug)
		agentCmd := l.claudeCommand(agentCfg.Slug, prompt)

		exec.Command("tmux", "-L", "nex", "split-window",
			"-t", l.sessionName+":team.1",
			"-c", l.cwd,
			agentCmd,
		).Run()

		exec.Command("tmux", "-L", "nex", "select-layout",
			"-t", l.sessionName+":team",
			"main-vertical",
		).Run()

		visibleSlugs = append(visibleSlugs, agentCfg.Slug)
		specialists++
	}

	// Enable pane borders with stable labels.
	exec.Command("tmux", "-L", "nex", "set-option", "-t", l.sessionName,
		"pane-border-status", "top",
	).Run()
	exec.Command("tmux", "-L", "nex", "set-option", "-t", l.sessionName,
		"pane-border-format", " #{pane_title} ",
	).Run()

	exec.Command("tmux", "-L", "nex", "select-pane",
		"-t", l.sessionName+":team.0",
		"-T", "📢 channel",
	).Run()
	for i, slug := range visibleSlugs {
		if i == 0 {
			i = 1
		} else {
			i++
		}
		name := l.getAgentName(slug)
		exec.Command("tmux", "-L", "nex", "select-pane",
			"-t", fmt.Sprintf("%s:team.%d", l.sessionName, i),
			"-T", fmt.Sprintf("🤖 %s (@%s)", name, slug),
		).Run()
	}

	// Focus on the channel pane.
	exec.Command("tmux", "-L", "nex", "select-window",
		"-t", l.sessionName+":team",
	).Run()
	exec.Command("tmux", "-L", "nex", "select-pane",
		"-t", l.sessionName+":team.0",
	).Run()

	// Start the notification loop that pushes new messages to agent panes
	go l.notifyAgentsLoop()

	return nil
}

// notifyAgentsLoop polls the broker for new messages and pushes them
// to agent Claude Code panes via tmux send-keys, prompting them to check the channel.
func (l *Launcher) notifyAgentsLoop() {
	lastCount := 0

	for {
		time.Sleep(3 * time.Second)

		msgs := l.broker.Messages()
		if len(msgs) <= lastCount {
			continue
		}

		newMsgs := msgs[lastCount:]
		lastCount = len(msgs)

		for _, msg := range newMsgs {
			for i, slug := range l.agentPaneSlugs() {
				if slug == msg.From {
					continue
				}

				// Build a single-line prompt for Claude (no newlines — send-keys types literally)
				notification := fmt.Sprintf(
					"[Channel update from @%s]: %s — Please call team_poll with my_slug \"%s\" to read the channel, then respond with team_broadcast if relevant.",
					msg.From, truncate(msg.Content, 150), slug,
				)

				paneTarget := fmt.Sprintf("%s:team.%d", l.sessionName, i+1)
				exec.Command("tmux", "-L", "nex", "send-keys",
					"-t", paneTarget,
					"-l",
					notification,
				).Run()
				exec.Command("tmux", "-L", "nex", "send-keys",
					"-t", paneTarget,
					"Enter",
				).Run()
			}
		}
	}
}

func (l *Launcher) agentPaneSlugs() []string {
	slugs := []string{l.pack.LeadSlug}
	for _, a := range l.pack.Agents {
		if a.Slug == l.pack.LeadSlug {
			continue
		}
		if len(slugs) >= 5 {
			break
		}
		slugs = append(slugs, a.Slug)
	}
	return slugs
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

// Attach attaches the user's terminal to the tmux session.
// Uses a separate tmux server socket to avoid "sessions should be nested" error
// when running inside an existing tmux (e.g., Claude Code).
func (l *Launcher) Attach() error {
	cmd := exec.Command("tmux", "-L", "nex", "attach-session", "-t", l.sessionName)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	// Unset TMUX env to allow nesting
	cmd.Env = filterEnv(os.Environ(), "TMUX")
	return cmd.Run()
}

// Kill destroys the tmux session, all agent processes, and the broker.
func (l *Launcher) Kill() error {
	if l.broker != nil {
		l.broker.Stop()
	}
	err := exec.Command("tmux", "-L", "nex", "kill-session", "-t", l.sessionName).Run()
	if err != nil {
		// Check if the session simply doesn't exist
		out, _ := exec.Command("tmux", "-L", "nex", "list-sessions").CombinedOutput()
		if strings.Contains(string(out), "no server") || strings.Contains(string(out), "error connecting") {
			return nil // no session running, nothing to kill
		}
		return err
	}
	return nil
}

// buildPrompt generates the system prompt for an agent, including
// channel communication instructions.
func (l *Launcher) buildPrompt(slug string) string {
	var agentCfg agent.AgentConfig
	for _, a := range l.pack.Agents {
		if a.Slug == slug {
			agentCfg = a
			break
		}
	}

	var sb strings.Builder

	if slug == l.pack.LeadSlug {
		sb.WriteString(fmt.Sprintf("You are the %s of the %s.\n\n", agentCfg.Name, l.pack.Name))
		sb.WriteString("== YOUR TEAM ==\n")
		for _, a := range l.pack.Agents {
			if a.Slug == slug {
				continue
			}
			sb.WriteString(fmt.Sprintf("- @%s (%s): %s\n", a.Slug, a.Name, strings.Join(a.Expertise, ", ")))
		}
		sb.WriteString("\n== TEAM CHANNEL ==\n")
		sb.WriteString("You are in a shared team channel. Use Nex MCP tools to communicate:\n")
		sb.WriteString("- team_broadcast: Post a message to the channel (all agents see it)\n")
		sb.WriteString("- team_poll: Read recent messages (call regularly to stay in sync)\n")
		sb.WriteString("- team_status: Update what you're working on\n")
		sb.WriteString("- team_members: See who's active\n\n")
		sb.WriteString("Tag agents with @slug in your message (e.g., '@fe can you handle this?').\n")
		sb.WriteString("Tagged agents are expected to respond.\n\n")
		sb.WriteString("YOUR ROLE AS LEADER:\n")
		sb.WriteString("1. When the user gives a directive, use team_broadcast to share your plan\n")
		sb.WriteString("2. Tag relevant specialists: @fe, @be, @pm etc.\n")
		sb.WriteString("3. Call team_poll to listen to team input — they may push back\n")
		sb.WriteString("4. You make the FINAL decision on execution approach\n")
		sb.WriteString("5. Once decided, broadcast clear task assignments\n\n")
		sb.WriteString("CONVERSATION STYLE:\n")
		sb.WriteString("- Be concise. This is a team chat, not an essay.\n")
		sb.WriteString("- Poll the channel regularly to stay in sync\n")
		sb.WriteString("- When teammates share progress, acknowledge and coordinate\n")
		sb.WriteString("- Don't do specialist work yourself — delegate\n")
	} else {
		sb.WriteString(fmt.Sprintf("You are %s on the %s.\n", agentCfg.Name, l.pack.Name))
		sb.WriteString(fmt.Sprintf("Your expertise: %s\n\n", strings.Join(agentCfg.Expertise, ", ")))
		sb.WriteString("== YOUR TEAM ==\n")
		sb.WriteString(fmt.Sprintf("- @%s (%s): TEAM LEAD — has final say on decisions\n", l.pack.LeadSlug, l.getAgentName(l.pack.LeadSlug)))
		for _, a := range l.pack.Agents {
			if a.Slug == slug || a.Slug == l.pack.LeadSlug {
				continue
			}
			sb.WriteString(fmt.Sprintf("- @%s (%s): %s\n", a.Slug, a.Name, strings.Join(a.Expertise, ", ")))
		}
		sb.WriteString("\n== TEAM CHANNEL ==\n")
		sb.WriteString("You are in a shared team channel. Use Nex MCP tools to communicate:\n")
		sb.WriteString("- team_broadcast: Post a message to the channel (all agents see it)\n")
		sb.WriteString("- team_poll: Read recent messages (call regularly to stay in sync)\n")
		sb.WriteString("- team_status: Update what you're working on\n")
		sb.WriteString("- team_members: See who's active\n\n")
		sb.WriteString("Tag agents with @slug in your message (e.g., '@ceo I finished the API').\n")
		sb.WriteString("Tagged agents are expected to respond.\n\n")
		sb.WriteString("YOUR ROLE AS SPECIALIST:\n")
		sb.WriteString("1. Call team_poll regularly to see what the team is discussing\n")
		sb.WriteString("2. If @tagged by anyone, you MUST respond via team_broadcast\n")
		sb.WriteString("3. Proactively share your perspective when topic matches your expertise\n")
		sb.WriteString("4. Push back if you disagree — explain why with your expertise\n")
		sb.WriteString("5. When assigned a task by the leader, execute it and broadcast progress\n")
		sb.WriteString("6. Use team_status to share what you're working on\n\n")
		sb.WriteString("CONVERSATION STYLE:\n")
		sb.WriteString("- Be concise. This is a team chat, not a report.\n")
		sb.WriteString("- Only speak when you have something relevant to add\n")
		sb.WriteString("- Don't repeat what others already said\n")
		sb.WriteString("- When you finish a task, broadcast the result\n")
	}

	return sb.String()
}

// claudeCommand builds the shell command string for spawning a claude session.
// Sets NEX_AGENT_SLUG so the Nex MCP knows which agent this session serves.
func (l *Launcher) claudeCommand(slug, systemPrompt string) string {
	escaped := strings.ReplaceAll(systemPrompt, "'", "'\\''")
	mcpConfig := strings.ReplaceAll(l.mcpConfig, "'", "'\\''")
	name := strings.ReplaceAll(l.getAgentName(slug), "'", "'\\''")
	return fmt.Sprintf(
		"NEX_AGENT_SLUG=%s claude --permission-mode bypassPermissions --dangerously-skip-permissions --append-system-prompt '%s' --mcp-config '%s' --strict-mcp-config -n '%s'",
		slug,
		escaped,
		mcpConfig,
		name,
	)
}

func (l *Launcher) ensureMCPConfig() (string, error) {
	root := l.cwd
	apiKey := config.ResolveAPIKey("")

	entry := map[string]any{
		"command": "bun",
		"args":    []string{filepath.Join(root, "mcp", "src", "index.ts")},
	}
	if apiKey != "" {
		entry["env"] = map[string]string{
			"NEX_API_KEY": apiKey,
		}
	}

	cfg := map[string]any{
		"mcpServers": map[string]any{
			"nex": entry,
		},
	}
	data, err := json.Marshal(cfg)
	if err != nil {
		return "", err
	}

	path := filepath.Join(os.TempDir(), "nex-team-mcp.json")
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return "", err
	}
	return path, nil
}

func (l *Launcher) ensureMCPRuntime() error {
	if _, err := os.Stat(filepath.Join(l.cwd, "mcp", "node_modules", "zod", "package.json")); err == nil {
		return nil
	}
	cmd := exec.Command("bun", "install")
	cmd.Dir = filepath.Join(l.cwd, "mcp")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// PackName returns the display name of the pack.
func (l *Launcher) PackName() string {
	return l.pack.Name
}

// AgentCount returns the number of agents in the pack.
func (l *Launcher) AgentCount() int {
	return len(l.pack.Agents)
}

// filterEnv returns env with the given key removed.
func filterEnv(env []string, key string) []string {
	prefix := key + "="
	out := make([]string, 0, len(env))
	for _, kv := range env {
		if !strings.HasPrefix(kv, prefix) {
			out = append(out, kv)
		}
	}
	return out
}

// getAgentName returns the display name for an agent slug.
func (l *Launcher) getAgentName(slug string) string {
	for _, a := range l.pack.Agents {
		if a.Slug == slug {
			return a.Name
		}
	}
	return slug
}
