package provider

import (
	"github.com/nex-ai/nex-cli/internal/agent"
	"github.com/nex-ai/nex-cli/internal/api"
	"github.com/nex-ai/nex-cli/internal/config"
)

// DefaultStreamFnResolver returns a StreamFnResolver that picks the right provider
// based on the user's config (llm_provider, gemini_api_key).
func DefaultStreamFnResolver(client *api.Client) agent.StreamFnResolver {
	cfg, _ := config.Load()
	return func(agentSlug string) agent.StreamFn {
		switch cfg.LLMProvider {
		case "gemini":
			return CreateGeminiStreamFn(cfg.GeminiAPIKey)
		case "nex-ask":
			return CreateNexAskStreamFn(client)
		case "claude-code", "":
			// Default to Claude Code — most capable for multi-turn orchestration
			return CreateClaudeCodeStreamFn(agentSlug)
		default:
			return CreateClaudeCodeStreamFn(agentSlug)
		}
	}
}
