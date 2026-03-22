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
	Subtype string `json:"subtype,omitempty"`
	Message *struct {
		Content []struct {
			Type     string `json:"type"`
			Text     string `json:"text,omitempty"`
			Thinking string `json:"thinking,omitempty"`
			ID       string `json:"id,omitempty"`
			Name     string `json:"name,omitempty"`
			Input    any    `json:"input,omitempty"`
			Content  any    `json:"content,omitempty"` // for tool_result
		} `json:"content"`
	} `json:"message"`
	Result         string `json:"result,omitempty"`
	ToolUseResult  *struct {
		Stdout string `json:"stdout,omitempty"`
		Stderr string `json:"stderr,omitempty"`
	} `json:"tool_use_result,omitempty"`
}

// CreateClaudeCodeStreamFn returns a StreamFn that runs the `claude` CLI and
// parses its NDJSON stream output.
func CreateClaudeCodeStreamFn(agentSlug string) agent.StreamFn {
	return func(msgs []agent.Message, tools []agent.AgentTool) <-chan agent.StreamChunk {
		ch := make(chan agent.StreamChunk, 64)
		go func() {
			defer close(ch)

			// Verify claude binary is available before spawning.
			if _, err := exec.LookPath("claude"); err != nil {
				ch <- agent.StreamChunk{Type: "error", Content: "Claude CLI not found. Run /init to choose a different provider."}
				return
			}

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

			// Capture stderr for error reporting.
			var stderrBuf strings.Builder
			cmd.Stderr = &stderrBuf

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
			// Increase scanner buffer for large tool results
			scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
			gotAssistantText := false
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
							switch block.Type {
							case "thinking":
								if block.Thinking != "" {
									ch <- agent.StreamChunk{Type: "thinking", Content: block.Thinking}
								}
							case "text":
								if block.Text != "" {
									ch <- agent.StreamChunk{Type: "text", Content: block.Text}
									gotAssistantText = true
								}
							case "tool_use":
								inputJSON, _ := json.Marshal(block.Input)
								ch <- agent.StreamChunk{
									Type:      "tool_use",
									ToolName:  block.Name,
									ToolUseID: block.ID,
									ToolInput: string(inputJSON),
								}
							}
						}
					}
				case "user":
					// tool_result messages from Claude's tool execution
					if msg.Message != nil {
						for _, block := range msg.Message.Content {
							if block.Type == "tool_result" {
								resultStr := ""
								switch v := block.Content.(type) {
								case string:
									resultStr = v
								default:
									b, _ := json.Marshal(v)
									resultStr = string(b)
								}
								// Truncate long results for display
								if len(resultStr) > 500 {
									resultStr = resultStr[:500] + "..."
								}
								ch <- agent.StreamChunk{
									Type:      "tool_result",
									ToolUseID: block.ID,
									Content:   resultStr,
								}
							}
						}
					}
					// Also check tool_use_result at message level
					if msg.ToolUseResult != nil && msg.ToolUseResult.Stdout != "" {
						stdout := msg.ToolUseResult.Stdout
						if len(stdout) > 500 {
							stdout = stdout[:500] + "..."
						}
						ch <- agent.StreamChunk{Type: "tool_result", Content: stdout}
					}
				case "result":
					if msg.Result != "" && !gotAssistantText {
						ch <- agent.StreamChunk{Type: "text", Content: msg.Result}
					}
				}
			}

			if err := cmd.Wait(); err != nil {
				stderr := strings.TrimSpace(stderrBuf.String())
				errMsg := fmt.Sprintf("claude exited with error: %v", err)
				if stderr != "" {
					errMsg = fmt.Sprintf("claude exited with error: %v — %s", err, stderr)
				}
				ch <- agent.StreamChunk{Type: "error", Content: errMsg}
			}
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
