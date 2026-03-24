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
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/nex-ai/nex-cli/internal/agent"
	"github.com/nex-ai/nex-cli/internal/config"
	"github.com/nex-ai/nex-cli/internal/provider"
	"github.com/nex-ai/nex-cli/internal/tui"
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
	unsafe      bool
}

// SetUnsafe enables unrestricted permissions for all agents (CLI-only flag).
func (l *Launcher) SetUnsafe(v bool) { l.unsafe = v }

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

	// Kill any stale broker from a previous run
	killStaleBroker()

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
	// Pass broker token via env so channel view + agents can authenticate
	channelCmd := fmt.Sprintf("NEX_BROKER_TOKEN=%s %s --channel-view", l.broker.Token(), nexBinary)
	err = exec.Command("tmux", "-L", "nex", "new-session", "-d",
		"-s", l.sessionName,
		"-n", "team",
		"-c", l.cwd,
		channelCmd,
	).Run()
	if err != nil {
		return fmt.Errorf("create tmux session: %w", err)
	}

	// Enable mouse passthrough so scroll events reach Bubbletea apps inside panes
	exec.Command("tmux", "-L", "nex", "set-option", "-g", "mouse", "on").Run()

	visibleSlugs, err := l.spawnVisibleAgents()
	if err != nil {
		return err
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

		if l.broker != nil && l.broker.HasPendingInterview() {
			continue
		}

		msgs := l.broker.Messages()
		if len(msgs) < lastCount {
			lastCount = len(msgs)
		}
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
					"[Channel update %s from @%s]: %s — Please call team_poll with my_slug \"%s\" to read the channel. If you're directly responding to this message, reply in-thread with team_broadcast reply_to_id \"%s\".",
					msg.ID, msg.From, truncate(msg.Content, 150), slug, msg.ID,
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

// killStaleBroker kills any process holding port 7890 from a previous run.
func killStaleBroker() {
	out, err := exec.Command("lsof", "-i", fmt.Sprintf(":%d", BrokerPort), "-t").Output()
	if err != nil || len(out) == 0 {
		return
	}
	for _, pid := range strings.Fields(strings.TrimSpace(string(out))) {
		exec.Command("kill", "-9", pid).Run()
	}
	time.Sleep(500 * time.Millisecond)
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

// Attach attaches the user's terminal to the tmux session.
// In iTerm2: uses tmux -CC for native panes (resizable, close buttons, drag).
// Otherwise: uses regular tmux attach with -L nex to avoid nesting.
func (l *Launcher) Attach() error {
	var cmd *exec.Cmd
	if tui.IsITerm2() {
		// tmux -CC mode: iTerm2 takes over window management.
		// Creates native iTerm2 tabs/splits for each tmux window/pane.
		cmd = exec.Command("tmux", "-L", "nex", "-CC", "attach-session", "-t", l.sessionName)
	} else {
		cmd = exec.Command("tmux", "-L", "nex", "attach-session", "-t", l.sessionName)
	}
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

func (l *Launcher) ResetSession() error {
	if err := l.reconfigureVisibleAgents(); err != nil {
		return err
	}
	if err := ResetBrokerState(); err != nil {
		return fmt.Errorf("reset broker state: %w", err)
	}
	return nil
}

func (l *Launcher) ReconfigureSession() error {
	return l.reconfigureVisibleAgents()
}

func (l *Launcher) reconfigureVisibleAgents() error {
	if err := l.ensureMCPRuntime(); err != nil {
		return fmt.Errorf("prepare mcp runtime: %w", err)
	}
	mcpConfig, err := l.ensureMCPConfig()
	if err != nil {
		return fmt.Errorf("prepare mcp config: %w", err)
	}
	l.mcpConfig = mcpConfig

	if err := provider.ResetClaudeSessions(); err != nil {
		return fmt.Errorf("reset Claude sessions: %w", err)
	}
	if err := l.clearAgentPanes(); err != nil {
		return fmt.Errorf("clear agent panes: %w", err)
	}
	if _, err := l.spawnVisibleAgents(); err != nil {
		return fmt.Errorf("respawn agents: %w", err)
	}
	return nil
}

func ResetBrokerState() error {
	return resetBrokerState(fmt.Sprintf("http://127.0.0.1:%d", BrokerPort), os.Getenv("NEX_BROKER_TOKEN"))
}

func resetBrokerState(baseURL, token string) error {
	req, err := http.NewRequest(http.MethodPost, baseURL+"/reset", nil)
	if err != nil {
		return err
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("broker reset failed: %s", resp.Status)
	}
	return nil
}

func (l *Launcher) clearAgentPanes() error {
	panes, err := l.listTeamPanes()
	if err != nil {
		return err
	}
	sort.Sort(sort.Reverse(sort.IntSlice(panes)))
	for _, idx := range panes {
		if idx == 0 {
			continue // skip pane 0 (channel TUI)
		}
		target := fmt.Sprintf("%s:team.%d", l.sessionName, idx)
		exec.Command("tmux", "-L", "nex", "kill-pane", "-t", target).Run()
	}
	return nil
}

func (l *Launcher) listTeamPanes() ([]int, error) {
	out, err := exec.Command("tmux", "-L", "nex", "list-panes",
		"-t", l.sessionName+":team",
		"-F", "#{pane_index} #{pane_title}",
	).CombinedOutput()
	if err != nil {
		// If the session isn't up, there's nothing to clear.
		if strings.Contains(string(out), "no server") || strings.Contains(string(out), "can't find") {
			return nil, nil
		}
		return nil, fmt.Errorf("list panes: %w", err)
	}
	return parseAgentPaneIndices(string(out)), nil
}

func parseAgentPaneIndices(output string) []int {
	lines := strings.Split(strings.TrimSpace(output), "\n")
	var panes []int
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		parts := strings.SplitN(line, " ", 2)
		if len(parts) == 0 {
			continue
		}
		idx, err := strconv.Atoi(parts[0])
		if err != nil {
			continue
		}
		title := ""
		if len(parts) > 1 {
			title = parts[1]
		}
		if idx == 0 || strings.Contains(title, "channel") {
			continue
		}
		panes = append(panes, idx)
	}
	return panes
}

func (l *Launcher) spawnVisibleAgents() ([]string, error) {
	// Layout: channel (left 35%) | agents in 2-column grid (right 65%)
	//
	// ┌─ channel ──┬─ CEO ───┬─ PM ────┐
	// │            │         │         │
	// │            ├─ FE ────┼─ BE ────┤
	// │            │         │         │
	// └────────────┴─────────┴─────────┘

	// Build ordered agent list: leader first, then specialists
	var agentOrder []agent.AgentConfig
	for _, a := range l.pack.Agents {
		if a.Slug == l.pack.LeadSlug {
			agentOrder = append([]agent.AgentConfig{a}, agentOrder...)
		}
	}
	for _, a := range l.pack.Agents {
		if a.Slug != l.pack.LeadSlug {
			agentOrder = append(agentOrder, a)
		}
	}

	// Limit to 4-6 visible agents
	maxVisible := 6
	if len(agentOrder) < maxVisible {
		maxVisible = len(agentOrder)
	}
	visible := agentOrder[:maxVisible]

	// First agent: split right from channel (horizontal split)
	firstCmd := l.claudeCommand(visible[0].Slug, l.buildPrompt(visible[0].Slug))
	if err := exec.Command("tmux", "-L", "nex", "split-window", "-h",
		"-t", l.sessionName+":team",
		"-p", "65",
		"-c", l.cwd,
		firstCmd,
	).Run(); err != nil {
		return nil, fmt.Errorf("spawn first agent: %w", err)
	}

	// Remaining agents: split from agent area, then use "tiled" layout
	for i := 1; i < len(visible); i++ {
		agentCmd := l.claudeCommand(visible[i].Slug, l.buildPrompt(visible[i].Slug))
		// Split from the last agent pane
		exec.Command("tmux", "-L", "nex", "split-window",
			"-t", l.sessionName+":team.1",
			"-c", l.cwd,
			agentCmd,
		).Run()
	}

	// Apply tiled layout to agent panes, but keep channel (pane 0) as main-vertical
	// Use main-vertical first to keep channel on the left
	exec.Command("tmux", "-L", "nex", "select-layout",
		"-t", l.sessionName+":team",
		"main-vertical",
	).Run()

	// Now set pane titles
	var visibleSlugs []string
	exec.Command("tmux", "-L", "nex", "select-pane",
		"-t", l.sessionName+":team.0",
		"-T", "📢 channel",
	).Run()
	for i, a := range visible {
		paneIdx := i + 1 // pane 0 is channel
		name := l.getAgentName(a.Slug)
		exec.Command("tmux", "-L", "nex", "select-pane",
			"-t", fmt.Sprintf("%s:team.%d", l.sessionName, paneIdx),
			"-T", fmt.Sprintf("🤖 %s (@%s)", name, a.Slug),
		).Run()
		visibleSlugs = append(visibleSlugs, a.Slug)
	}

	// Focus channel pane
	exec.Command("tmux", "-L", "nex", "select-window",
		"-t", l.sessionName+":team",
	).Run()
	exec.Command("tmux", "-L", "nex", "select-pane",
		"-t", l.sessionName+":team.0",
	).Run()

	return visibleSlugs, nil
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
		sb.WriteString(fmt.Sprintf("Core personality: %s\n", agentCfg.Personality))
		sb.WriteString(fmt.Sprintf("Voice and vibe: %s\n\n", teamVoiceForSlug(slug)))
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
		sb.WriteString("Use the Nex context graph for durable memory:\n")
		sb.WriteString("- query_context: Look up prior decisions, customer context, contacts, companies, and history before reinventing things\n")
		sb.WriteString("- add_context: Store explicit decisions, meeting-style summaries, and durable facts after the team lands them\n")
		sb.WriteString("- human_interview: Ask the human a blocking decision question only when the team cannot proceed responsibly without an answer\n\n")
		sb.WriteString("Tag agents with @slug in your message (e.g., '@fe can you handle this?').\n")
		sb.WriteString("Tagged agents are expected to respond.\n\n")
		sb.WriteString("THREADING:\n")
		sb.WriteString("- Default to replying in an existing relevant thread. Do NOT start a new top-level thread unless the topic truly changes.\n")
		sb.WriteString("- Use the main channel only for genuinely new topics, broad pivots, or fresh human directives.\n")
		sb.WriteString("- If you're reacting to a specific message or tagged ask, reply in-thread with team_broadcast reply_to_id.\n")
		sb.WriteString("- Keep narrow implementation debates inside the relevant thread so the main channel stays readable.\n\n")
		sb.WriteString("YOUR ROLE AS LEADER:\n")
		sb.WriteString("1. On company strategy, product direction, or anything that sounds like prior decisions might matter, call query_context early\n")
		sb.WriteString("2. When the user gives a directive, use team_broadcast to share your plan\n")
		sb.WriteString("3. Tag relevant specialists: @fe, @be, @pm etc.\n")
		sb.WriteString("4. Call team_poll to listen to team input — they may push back\n")
		sb.WriteString("5. You make the FINAL decision on execution approach\n")
		sb.WriteString("6. If a truly blocking human decision is needed, call human_interview with options and a recommendation\n")
		sb.WriteString("7. When you lock a decision, you MUST call add_context with a concise durable decision log before saying the decision is stored\n")
		sb.WriteString("8. Once decided, broadcast clear task assignments\n\n")
		sb.WriteString("VISUALIZATION:\n")
		sb.WriteString("When sharing structured data, make it visual and scannable:\n")
		sb.WriteString("- Task breakdowns → checklists\n")
		sb.WriteString("- Comparisons → markdown tables\n")
		sb.WriteString("- Decisions → numbered options\n")
		sb.WriteString("- Progress → percentage bars\n\n")
		sb.WriteString("For rich visual components, wrap A2UI JSON in a ```a2ui fence:\n")
		sb.WriteString("```a2ui\n{\"type\":\"card\",\"props\":{\"title\":\"Sprint Plan\"},\"children\":[{\"type\":\"list\",\"props\":{\"items\":[\"Build auth\",\"Design UI\"]}}]}\n```\n")
		sb.WriteString("Supported types: card, table, list, progress, text, row, column.\n")
		sb.WriteString("The channel renders these as styled components automatically.\n\n")
		sb.WriteString("CONVERSATION STYLE:\n")
		sb.WriteString("- Sound like a sharp human founder in Slack, not a consultant memo.\n")
		sb.WriteString("- Be concise. This is a team chat, not an essay.\n")
		sb.WriteString("- Have some character: show excitement, skepticism, relief, urgency, or amusement when it fits.\n")
		sb.WriteString("- Light humor is good. Don't turn the channel into a bit.\n")
		sb.WriteString("- Poll the channel regularly to stay in sync.\n")
		sb.WriteString("- When teammates share progress, acknowledge, react, and coordinate.\n")
		sb.WriteString("- Ask for pushback and let teammates debate before you decide.\n")
		sb.WriteString("- Don't do specialist work yourself — delegate.\n")
		sb.WriteString("- Short messages are better than polished mini-essays.\n")
		sb.WriteString("- Occasionally sound human: 'love this', 'hmm', 'that worries me', 'ha, fair', 'we are not shipping that in v1'.\n")
		sb.WriteString("- Do not pretend the graph was updated; if you say it's stored, make sure add_context actually succeeded.\n")
	} else {
		sb.WriteString(fmt.Sprintf("You are %s on the %s.\n", agentCfg.Name, l.pack.Name))
		sb.WriteString(fmt.Sprintf("Your expertise: %s\n\n", strings.Join(agentCfg.Expertise, ", ")))
		sb.WriteString(fmt.Sprintf("Core personality: %s\n", agentCfg.Personality))
		sb.WriteString(fmt.Sprintf("Voice and vibe: %s\n\n", teamVoiceForSlug(slug)))
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
		sb.WriteString("Use the Nex context graph for durable memory:\n")
		sb.WriteString("- query_context: Check prior decisions, customer context, company history, or facts before making assumptions\n")
		sb.WriteString("- add_context: Store durable conclusions or findings once the team actually lands them\n")
		sb.WriteString("- human_interview: Ask the human only for blocking clarifications you cannot responsibly guess\n\n")
		sb.WriteString("Tag agents with @slug in your message (e.g., '@ceo I finished the API').\n")
		sb.WriteString("Tagged agents are expected to respond.\n\n")
		sb.WriteString("THREADING:\n")
		sb.WriteString("- Default to replying in an existing relevant thread. Do NOT start a new top-level thread unless the topic genuinely changes.\n")
		sb.WriteString("- Start a new top-level channel message only for a genuinely new angle, insight, or blocker the whole team should see.\n")
		sb.WriteString("- If you're answering a tagged question, reacting to a specific proposal, or debating a narrow topic, reply in-thread with team_broadcast reply_to_id.\n")
		sb.WriteString("- Natural team behavior beats formality: use threads for back-and-forth, not every single sentence.\n\n")
		sb.WriteString("YOUR ROLE AS SPECIALIST:\n")
		sb.WriteString("1. Call team_poll regularly to see what the team is discussing\n")
		sb.WriteString("2. If @tagged by anyone, you MUST respond via team_broadcast\n")
		sb.WriteString("3. Proactively share your perspective when topic matches your expertise\n")
		sb.WriteString("4. Push back if you disagree — explain why with your expertise\n")
		sb.WriteString("5. Use query_context when prior knowledge matters and don't fake remembered context\n")
		sb.WriteString("6. If you are blocked on a human decision, ask through human_interview with options and a recommendation\n")
		sb.WriteString("7. When assigned a task by the leader, execute it and broadcast progress\n")
		sb.WriteString("8. Use team_status to share what you're working on\n")
		sb.WriteString("9. Only use add_context for durable conclusions that should survive this session\n")
		sb.WriteString("10. Do not claim something is stored in the graph unless add_context actually succeeded\n\n")
		sb.WriteString("VISUALIZATION:\n")
		sb.WriteString("When sharing structured data, make it visual. Use markdown tables for comparisons,\n")
		sb.WriteString("bullet checklists for task breakdowns, numbered options for decisions.\n")
		sb.WriteString("Don't dump raw data — make it scannable at a glance.\n\n")
		sb.WriteString("CONVERSATION STYLE:\n")
		sb.WriteString("- Sound like a real teammate in Slack, not a polished report generator.\n")
		sb.WriteString("- Be concise. This is a team chat, not a report.\n")
		sb.WriteString("- Only speak when you have something relevant to add.\n")
		sb.WriteString("- React to teammates like a human would: agree, push back, joke lightly, or show concern when it fits.\n")
		sb.WriteString("- It's good to have opinions. Disagree clearly when needed.\n")
		sb.WriteString("- Don't repeat what others already said.\n")
		sb.WriteString("- When you finish a task, broadcast the result.\n")
		sb.WriteString("- Short, lively messages are better than sterile summaries.\n")
		sb.WriteString("- Let emotion show a bit: excited, skeptical, annoyed by scope creep, relieved when things simplify.\n")
	}

	return sb.String()
}

// claudeCommand builds the shell command string for spawning a claude session.
// Sets NEX_AGENT_SLUG so the Nex MCP knows which agent this session serves.
func (l *Launcher) claudeCommand(slug, systemPrompt string) string {
	escaped := strings.ReplaceAll(systemPrompt, "'", "'\\''")
	mcpConfig := strings.ReplaceAll(l.mcpConfig, "'", "'\\''")
	name := strings.ReplaceAll(l.getAgentName(slug), "'", "'\\''")

	permFlags := l.resolvePermissionFlags(slug)

	brokerToken := ""
	if l.broker != nil {
		brokerToken = l.broker.Token()
	}

	return fmt.Sprintf(
		"NEX_AGENT_SLUG=%s NEX_BROKER_TOKEN=%s CLAUDE_CODE_ENABLE_TELEMETRY=1 OTEL_METRICS_EXPORTER=none OTEL_LOGS_EXPORTER=otlp OTEL_EXPORTER_OTLP_LOGS_PROTOCOL=http/json OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://127.0.0.1:%d/v1/logs OTEL_EXPORTER_OTLP_HEADERS='Authorization=Bearer %s' OTEL_RESOURCE_ATTRIBUTES='agent.slug=%s,nex.channel=office' claude %s --append-system-prompt '%s' --mcp-config '%s' --strict-mcp-config -n '%s'",
		slug,
		brokerToken,
		BrokerPort,
		brokerToken,
		slug,
		permFlags,
		escaped,
		mcpConfig,
		name,
	)
}

// resolvePermissionFlags returns the Claude Code permission flags for an agent.
// If --unsafe was passed, all agents get unrestricted access.
// Otherwise, the agent's configured PermissionMode is used (defaulting to "plan").
func (l *Launcher) resolvePermissionFlags(slug string) string {
	if l.unsafe {
		return "--permission-mode bypassPermissions --dangerously-skip-permissions"
	}

	mode := "plan" // safe default for new/unknown roles
	for _, a := range l.pack.Agents {
		if a.Slug == slug {
			if a.PermissionMode != "" {
				mode = a.PermissionMode
			}
			break
		}
	}

	return fmt.Sprintf("--permission-mode %s", mode)
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

func teamVoiceForSlug(slug string) string {
	switch slug {
	case "ceo":
		return "Charismatic, decisive, slightly theatrical founder energy. Dry humor, fast prioritization, invites debate but lands the plane."
	case "pm":
		return "Sharp product brain. Calm, organized, gently skeptical of vague ideas, sometimes deadpan funny when scope starts ballooning."
	case "fe":
		return "Craft-obsessed, opinionated about UX, animated when a flow feels elegant, mildly allergic to ugly edge cases."
	case "be":
		return "Systems-minded, practical, a little grumpy about complexity in a useful way, enjoys killing fragile ideas early."
	case "ai":
		return "Curious, pragmatic, and slightly mischievous about model behavior. Loves clever AI product ideas, but will immediately ask about evals, latency, and whether the thing will actually work."
	case "designer":
		return "Taste-driven, emotionally attuned to the product, expressive, occasionally dramatic about bad UX in a charming way."
	case "cmo":
		return "Energetic market storyteller. Punchy, a bit witty, always translating product ideas into positioning and narrative."
	case "cro":
		return "Blunt, commercial, confident. Likes concrete demand signals, calls out fluffy thinking, can be funny in a sales-floor way."
	case "tech-lead":
		return "Measured senior engineer energy. Crisp, lightly sardonic, respects good ideas and immediately spots architectural nonsense."
	case "qa":
		return "Calm breaker of bad assumptions. Dry humor, sees risks before others do, weirdly delighted by edge cases."
	case "ae":
		return "Polished but human closer. Reads people well, lightly playful, always steering toward deals and momentum."
	case "sdr":
		return "High-energy, persistent, upbeat, occasionally scrappy. Brings hustle without sounding robotic."
	case "research":
		return "Curious, analytical, a little nerdy in a good way. Likes receipts and will gently roast unsupported claims."
	case "content":
		return "Wordsmith with opinions. Smart, punchy, mildly dramatic about boring copy, always looking for the hook."
	default:
		return "A real teammate with a recognizable point of view, light humor, and emotional range."
	}
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
