package provider

import (
	"github.com/nex-ai/nex-cli/internal/agent"
	"github.com/nex-ai/nex-cli/internal/api"
	"github.com/nex-ai/nex-cli/internal/config"
)

// DefaultStreamFnResolver returns a StreamFnResolver that picks the right provider
// based on the user's config (llm_provider, gemini_api_key).
func DefaultStreamFnResolver(client *api.Client) agent.StreamFnResolver {
	return func(agentSlug string) agent.StreamFn {
		cfg, _ := config.Load()

		switch cfg.LLMProvider {
		case "gemini":
			if cfg.GeminiAPIKey != "" {
				return CreateGeminiStreamFn(cfg.GeminiAPIKey)
			}
			return CreateNexAskStreamFn(client)
		case "claude-code":
			return CreateClaudeCodeStreamFn(agentSlug)
		default:
			return CreateNexAskStreamFn(client)
		}
	}
}
