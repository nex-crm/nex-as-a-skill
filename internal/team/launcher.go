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

// Launch creates the tmux session and spawns all agent windows.
func (l *Launcher) Launch() error {
	// Kill any existing session
	exec.Command("tmux", "kill-session", "-t", l.sessionName).Run()

	// Create new session with the first agent (leader)
	leaderPrompt := l.buildPrompt(l.pack.LeadSlug)
	leaderCmd := l.claudeCommand(leaderPrompt)

	err := exec.Command("tmux", "new-session", "-d",
		"-s", l.sessionName,
		"-n", l.pack.LeadSlug,
		"-c", l.cwd,
		leaderCmd,
	).Run()
	if err != nil {
		return fmt.Errorf("create tmux session: %w", err)
	}

	// Spawn specialist windows
	for _, agentCfg := range l.pack.Agents {
		if agentCfg.Slug == l.pack.LeadSlug {
			continue // already created as the first window
		}

		prompt := l.buildPrompt(agentCfg.Slug)
		cmd := l.claudeCommand(prompt)

		err := exec.Command("tmux", "new-window", "-d",
			"-t", l.sessionName,
			"-n", agentCfg.Slug,
			"-c", l.cwd,
			cmd,
		).Run()
		if err != nil {
			fmt.Fprintf(os.Stderr, "warning: failed to spawn %s: %v\n", agentCfg.Slug, err)
		}
	}

	return nil
}

// Attach attaches the user's terminal to the tmux session.
func (l *Launcher) Attach() error {
	cmd := exec.Command("tmux", "attach-session", "-t", l.sessionName)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// Kill destroys the tmux session and all agent processes.
func (l *Launcher) Kill() error {
	return exec.Command("tmux", "kill-session", "-t", l.sessionName).Run()
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

// getAgentName returns the display name for an agent slug.
func (l *Launcher) getAgentName(slug string) string {
	for _, a := range l.pack.Agents {
		if a.Slug == slug {
			return a.Name
		}
	}
	return slug
}
