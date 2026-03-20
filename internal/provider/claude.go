package provider

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/nex-ai/nex-cli/internal/agent"
)

// claudeEnvVarsToStrip are the env vars injected by Claude Code that must be
// removed so the child `claude` process does not detect a recursive invocation.
var claudeEnvVarsToStrip = []string{
	"CLAUDECODE",
	"CLAUDE_CODE_ENTRYPOINT",
	"CLAUDE_CODE_SESSION",
	"CLAUDE_CODE_PARENT_SESSION",
}

// claudeStreamMsg is the NDJSON envelope emitted by `claude --output-format stream-json`.
type claudeStreamMsg struct {
	Type    string `json:"type"`
	Message *struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	} `json:"message"`
	Result string `json:"result"`
}

// CreateClaudeCodeStreamFn returns a StreamFn that runs the `claude` CLI and
// parses its NDJSON stream output.
func CreateClaudeCodeStreamFn(agentSlug string) agent.StreamFn {
	return func(msgs []agent.Message, tools []agent.AgentTool) <-chan agent.StreamChunk {
		ch := make(chan agent.StreamChunk, 64)
		go func() {
			defer close(ch)

			prompt := buildPrompt(msgs)

			cmd := exec.Command(
				"claude",
				"-p", prompt,
				"--output-format", "stream-json",
				"--verbose",
				"--max-turns", "5",
				"--no-session-persistence",
			)

			// Strip Claude Code env vars to prevent recursive detection.
			cmd.Env = filteredEnv(claudeEnvVarsToStrip)

			stdout, err := cmd.StdoutPipe()
			if err != nil {
				ch <- agent.StreamChunk{Type: "error", Content: fmt.Sprintf("pipe: %v", err)}
				return
			}
			if err := cmd.Start(); err != nil {
				ch <- agent.StreamChunk{Type: "error", Content: fmt.Sprintf("start claude: %v", err)}
				return
			}

			scanner := bufio.NewScanner(stdout)
			for scanner.Scan() {
				line := scanner.Text()
				if line == "" {
					continue
				}
				var msg claudeStreamMsg
				if err := json.Unmarshal([]byte(line), &msg); err != nil {
					continue
				}
				switch msg.Type {
				case "assistant":
					if msg.Message != nil {
						for _, block := range msg.Message.Content {
							if block.Type == "text" && block.Text != "" {
								ch <- agent.StreamChunk{Type: "text", Content: block.Text}
							}
						}
					}
				case "result":
					if msg.Result != "" {
						ch <- agent.StreamChunk{Type: "text", Content: msg.Result}
					}
				}
			}

			cmd.Wait() //nolint:errcheck — stream errors are surfaced via chunks
		}()
		return ch
	}
}

// filteredEnv returns os.Environ() with the given keys removed.
func filteredEnv(strip []string) []string {
	stripSet := make(map[string]struct{}, len(strip))
	for _, k := range strip {
		stripSet[k] = struct{}{}
	}
	env := os.Environ()
	out := make([]string, 0, len(env))
	for _, kv := range env {
		key := kv
		if idx := strings.IndexByte(kv, '='); idx >= 0 {
			key = kv[:idx]
		}
		if _, skip := stripSet[key]; !skip {
			out = append(out, kv)
		}
	}
	return out
}

// buildPrompt concatenates messages into a simple text prompt.
func buildPrompt(msgs []agent.Message) string {
	var sb strings.Builder
	for _, m := range msgs {
		sb.WriteString(m.Role)
		sb.WriteString(": ")
		sb.WriteString(m.Content)
		sb.WriteString("\n")
	}
	return strings.TrimRight(sb.String(), "\n")
}
