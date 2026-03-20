package tui

import (
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// InitPhase represents a step in the onboarding flow.
type InitPhase string

const (
	InitIdle           InitPhase = "idle"
	InitAwaitEmail     InitPhase = "awaiting_email"
	InitPlatformDetect InitPhase = "platform_detect"
	InitProviderChoice InitPhase = "provider_choice"
	InitAgentChoice    InitPhase = "agent_choice"
	InitDone           InitPhase = "done"
)

// InitFlowModel is a stub state machine for the onboarding init flow.
type InitFlowModel struct {
	phase    InitPhase
	email    string
	provider string
}

// NewInitFlow creates an idle InitFlowModel.
func NewInitFlow() InitFlowModel {
	return InitFlowModel{phase: InitIdle}
}

// Update advances the flow based on incoming messages.
func (f InitFlowModel) Update(msg tea.Msg) (InitFlowModel, tea.Cmd) {
	switch m := msg.(type) {
	case InitFlowMsg:
		switch m.Phase {
		case string(InitAwaitEmail):
			f.phase = InitAwaitEmail
		case string(InitPlatformDetect):
			f.phase = InitPlatformDetect
		case string(InitProviderChoice):
			f.phase = InitProviderChoice
		case string(InitAgentChoice):
			f.phase = InitAgentChoice
		case string(InitDone):
			f.phase = InitDone
			if v, ok := m.Data["email"]; ok {
				f.email = v
			}
			if v, ok := m.Data["provider"]; ok {
				f.provider = v
			}
		}
	case ProviderChoiceMsg:
		f.provider = m.Provider
	}
	return f, nil
}

// View renders the current phase and instructions.
func (f InitFlowModel) View() string {
	heading, instructions := f.phaseText()
	labelStyle := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color(NexPurple))
	muteStyle := lipgloss.NewStyle().Foreground(lipgloss.Color(MutedColor))
	return labelStyle.Render(heading) + "\n" + muteStyle.Render(instructions)
}

func (f InitFlowModel) phaseText() (heading, instructions string) {
	switch f.phase {
	case InitIdle:
		return "Setup", "Run /init to begin."
	case InitAwaitEmail:
		return "Enter Email", "Please enter your email address."
	case InitPlatformDetect:
		return "Detecting Platform", "Scanning your environment…"
	case InitProviderChoice:
		return "Choose LLM Provider", "Select your preferred AI provider: Gemini, Claude Code, or Nex Ask."
	case InitAgentChoice:
		return "Choose Default Agent", "Select the default agent template."
	case InitDone:
		return "Setup Complete", "You're ready to use nex."
	default:
		return "Setup", "Run /init to begin."
	}
}
