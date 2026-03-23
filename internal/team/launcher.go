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
	"fmt"
	"os"
	"os/exec"
	"strings"

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
	return nil
}

// Launch creates the tmux session with:
//   - Window 0 "channel": Go TUI showing the aggregated team conversation
//   - Window 1 "agents": All agent Claude Code sessions in tiled panes
func (l *Launcher) Launch() error {
	// Start the shared channel broker
	l.broker = NewBroker()
	if err := l.broker.Start(); err != nil {
		return fmt.Errorf("start broker: %w", err)
	}

	// Kill any existing session
	exec.Command("tmux", "-L", "nex", "kill-session", "-t", l.sessionName).Run()

	// Resolve nex binary path for the channel view
	nexBinary, _ := os.Executable()

	// Window 0: Channel view (Go TUI polling the broker)
	channelCmd := fmt.Sprintf("%s --channel-view", nexBinary)
	err := exec.Command("tmux", "-L", "nex", "new-session", "-d",
		"-s", l.sessionName,
		"-n", "channel",
		"-c", l.cwd,
		channelCmd,
	).Run()
	if err != nil {
		return fmt.Errorf("create tmux session: %w", err)
	}

	// Window 1: First agent (leader) — this becomes the "agents" window
	leaderPrompt := l.buildPrompt(l.pack.LeadSlug)
	leaderCmd := l.claudeCommand(leaderPrompt)

	err = exec.Command("tmux", "-L", "nex", "new-window",
		"-t", l.sessionName,
		"-n", "agents",
		"-c", l.cwd,
		leaderCmd,
	).Run()
	if err != nil {
		return fmt.Errorf("create leader pane: %w", err)
	}

	// Split the agents window into panes for each specialist
	for _, agentCfg := range l.pack.Agents {
		if agentCfg.Slug == l.pack.LeadSlug {
			continue // already in the first pane
		}

		prompt := l.buildPrompt(agentCfg.Slug)
		agentCmd := l.claudeCommand(prompt)

		// Split horizontally or vertically to create new panes
		exec.Command("tmux", "-L", "nex", "split-window",
			"-t", l.sessionName+":agents",
			"-c", l.cwd,
			agentCmd,
		).Run()

		// Re-tile after each split to keep panes even
		exec.Command("tmux", "-L", "nex", "select-layout",
			"-t", l.sessionName+":agents",
			"tiled",
		).Run()
	}

	// Also create individual windows per agent for full-screen access
	for _, agentCfg := range l.pack.Agents {
		prompt := l.buildPrompt(agentCfg.Slug)
		agentCmd := l.claudeCommand(prompt)

		exec.Command("tmux", "-L", "nex", "new-window", "-d",
			"-t", l.sessionName,
			"-n", agentCfg.Slug,
			"-c", l.cwd,
			agentCmd,
		).Run()
	}

	// Select the channel window as the starting view
	exec.Command("tmux", "-L", "nex", "select-window",
		"-t", l.sessionName+":channel",
	).Run()

	return nil
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
func (l *Launcher) claudeCommand(systemPrompt string) string {
	// Escape single quotes in the prompt for shell
	escaped := strings.ReplaceAll(systemPrompt, "'", "'\\''")

	return fmt.Sprintf("claude --append-system-prompt '%s'", escaped)
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
