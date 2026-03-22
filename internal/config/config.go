// Package config handles loading, saving, and resolving Nex CLI configuration.
// Resolution chain: CLI flag > environment variable > config file.
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

// NexConfig mirrors ~/.nex/config.json.
type NexConfig struct {
	APIKey         string `json:"api_key,omitempty"`
	Email          string `json:"email,omitempty"`
	WorkspaceID    string `json:"workspace_id,omitempty"`
	WorkspaceSlug  string `json:"workspace_slug,omitempty"`
	LLMProvider    string `json:"llm_provider,omitempty"`
	GeminiAPIKey   string `json:"gemini_api_key,omitempty"`
	Pack           string `json:"pack,omitempty"`
	TeamLeadSlug   string `json:"team_lead_slug,omitempty"`
	MaxConcurrent  int    `json:"max_concurrent_agents,omitempty"`
	DefaultFormat  string `json:"default_format,omitempty"`
	DefaultTimeout int    `json:"default_timeout,omitempty"`
	DevURL         string `json:"dev_url,omitempty"`
}

// ConfigPath returns the absolute path to ~/.nex/config.json.
func ConfigPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".nex", "config.json")
	}
	return filepath.Join(home, ".nex", "config.json")
}

// BaseURL returns the resolved base URL.
// Priority: NEX_DEV_URL env > config dev_url > production default.
func BaseURL() string {
	if v := os.Getenv("NEX_DEV_URL"); v != "" {
		return v
	}
	if cfg, err := load(ConfigPath()); err == nil && cfg.DevURL != "" {
		return cfg.DevURL
	}
	return "https://app.nex.ai"
}

// APIBase returns the developer API base URL.
func APIBase() string {
	return fmt.Sprintf("%s/api/developers", BaseURL())
}

// RegisterURL returns the agent registration URL.
func RegisterURL() string {
	return fmt.Sprintf("%s/api/v1/agents/register", BaseURL())
}

// Load reads the config file. Returns an empty config if the file is missing or unreadable.
func Load() (NexConfig, error) {
	return load(ConfigPath())
}

func load(path string) (NexConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return NexConfig{}, nil
		}
		return NexConfig{}, err
	}
	var cfg NexConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return NexConfig{}, err
	}
	return cfg, nil
}

// Save writes cfg to the config file, creating parent directories as needed.
func Save(cfg NexConfig) error {
	path := ConfigPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(path, data, 0o600)
}

// ResolveAPIKey resolves the API key via: flag > NEX_API_KEY env > config file.
func ResolveAPIKey(flagValue string) string {
	if flagValue != "" {
		return flagValue
	}
	if v := os.Getenv("NEX_API_KEY"); v != "" {
		return v
	}
	cfg, _ := Load()
	return cfg.APIKey
}

// ResolveFormat resolves the output format via: flag > config file > "text".
func ResolveFormat(flagValue string) string {
	if flagValue != "" {
		return flagValue
	}
	cfg, _ := Load()
	if cfg.DefaultFormat != "" {
		return cfg.DefaultFormat
	}
	return "text"
}

// ResolveTimeout resolves the timeout (ms) via: flag > config file > 120000.
func ResolveTimeout(flagValue string) int {
	if flagValue != "" {
		if n, err := strconv.Atoi(flagValue); err == nil {
			return n
		}
	}
	cfg, _ := Load()
	if cfg.DefaultTimeout > 0 {
		return cfg.DefaultTimeout
	}
	return 120_000
}

// PersistRegistration merges registration data into the config file.
func PersistRegistration(data map[string]interface{}) error {
	cfg, _ := Load()
	if v, ok := data["api_key"].(string); ok && v != "" {
		cfg.APIKey = v
	}
	if v, ok := data["email"].(string); ok && v != "" {
		cfg.Email = v
	}
	if v, ok := data["workspace_id"].(string); ok && v != "" {
		cfg.WorkspaceID = v
	} else if v, ok := data["workspace_id"].(float64); ok {
		cfg.WorkspaceID = strconv.FormatFloat(v, 'f', -1, 64)
	}
	if v, ok := data["workspace_slug"].(string); ok && v != "" {
		cfg.WorkspaceSlug = v
	}
	return Save(cfg)
}
