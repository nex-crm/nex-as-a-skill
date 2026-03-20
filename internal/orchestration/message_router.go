package orchestration

import (
	"regexp"
	"strings"
	"sync"
	"time"
)

// AgentInfo describes an available agent for message routing.
type AgentInfo struct {
	Slug      string
	Expertise []string
}

// MessageRoutingResult is the output of a Route call.
type MessageRoutingResult struct {
	Primary       string   // agent slug
	Collaborators []string
	IsFollowUp    bool
	TeamLeadAware bool
}

type threadContext struct {
	agentSlug    string
	lastActivity time.Time
}

// MessageRouter routes free-text messages to the most appropriate agent.
type MessageRouter struct {
	router        *TaskRouter
	recentThreads map[string]*threadContext
	followUpWindow time.Duration
	mu            sync.Mutex
}

// NewMessageRouter returns a MessageRouter with a 30s follow-up window.
func NewMessageRouter() *MessageRouter {
	return &MessageRouter{
		router:        NewTaskRouter(),
		recentThreads: make(map[string]*threadContext),
		followUpWindow: 30 * time.Second,
	}
}

// RegisterAgent registers an agent's expertise with the underlying TaskRouter.
func (m *MessageRouter) RegisterAgent(slug string, expertise []string) {
	skills := make([]SkillDeclaration, len(expertise))
	for i, e := range expertise {
		skills[i] = SkillDeclaration{Name: e, Description: e, Proficiency: 1.0}
	}
	m.router.RegisterAgent(slug, skills)
}

// UnregisterAgent removes an agent from the message router.
func (m *MessageRouter) UnregisterAgent(slug string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.router.UnregisterAgent(slug)
	delete(m.recentThreads, slug)
}

// RecordAgentActivity marks an agent as recently active.
func (m *MessageRouter) RecordAgentActivity(agentSlug string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if tc, ok := m.recentThreads[agentSlug]; ok {
		tc.lastActivity = time.Now()
	} else {
		m.recentThreads[agentSlug] = &threadContext{
			agentSlug:    agentSlug,
			lastActivity: time.Now(),
		}
	}
}

// Route decides which agent(s) should handle a message.
func (m *MessageRouter) Route(message string, availableAgents []AgentInfo) MessageRoutingResult {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Register all available agents so the task router can score them.
	for _, a := range availableAgents {
		skills := make([]SkillDeclaration, len(a.Expertise))
		for i, e := range a.Expertise {
			skills[i] = SkillDeclaration{Name: e, Description: e, Proficiency: 1.0}
		}
		m.router.RegisterAgent(a.Slug, skills)
	}

	result := MessageRoutingResult{}

	// 1. Check follow-up.
	if followUpSlug := m.detectFollowUp(message); followUpSlug != "" {
		result.Primary = followUpSlug
		result.IsFollowUp = true
		result.TeamLeadAware = true
		return result
	}

	// 2. Extract skills from message.
	skills := m.ExtractSkills(message)
	if len(skills) == 0 {
		result.Primary = "team-lead"
		result.TeamLeadAware = true
		return result
	}

	// 3. Build a synthetic task and route it.
	task := TaskDefinition{
		ID:             "msg-route",
		RequiredSkills: skills,
	}
	capable := m.router.FindCapableAgents(task)
	if len(capable) == 0 {
		result.Primary = "team-lead"
		result.TeamLeadAware = true
		return result
	}

	result.Primary = capable[0].AgentSlug
	for _, rr := range capable[1:] {
		if rr.Score > 0.5 {
			result.Collaborators = append(result.Collaborators, rr.AgentSlug)
		}
	}
	result.TeamLeadAware = result.Primary == "team-lead" || len(result.Collaborators) > 0
	return result
}

var followUpPattern = regexp.MustCompile(
	`(?i)^(also|and |too |that |it |the results|those |these |this |what about|how about|can you also)`,
)

// detectFollowUp returns the most recently active agent slug if the message
// looks like a follow-up and was within the follow-up window.
func (m *MessageRouter) detectFollowUp(message string) string {
	if !followUpPattern.MatchString(strings.TrimSpace(message)) {
		return ""
	}
	var best *threadContext
	for _, tc := range m.recentThreads {
		if time.Since(tc.lastActivity) <= m.followUpWindow {
			if best == nil || tc.lastActivity.After(best.lastActivity) {
				best = tc
			}
		}
	}
	if best != nil {
		return best.agentSlug
	}
	return ""
}

// skillKeywords maps message keywords to skill names.
var skillKeywords = []struct {
	pattern *regexp.Regexp
	skills  []string
}{
	{regexp.MustCompile(`(?i)research|investigate|analyze`), []string{"market-research", "competitive-analysis"}},
	{regexp.MustCompile(`(?i)leads|prospect|outreach`), []string{"prospecting", "outreach"}},
	{regexp.MustCompile(`(?i)enrich|validate|data quality`), []string{"data-enrichment", "validation"}},
	{regexp.MustCompile(`(?i)seo|keyword|ranking|content`), []string{"seo", "content-analysis"}},
	{regexp.MustCompile(`(?i)customer|success|health|renewal`), []string{"relationship-management", "health-scoring"}},
	{regexp.MustCompile(`(?i)code|bug|fix|implement`), []string{"general", "planning"}},
}

// ExtractSkills returns a deduplicated list of skills inferred from the message.
func (m *MessageRouter) ExtractSkills(message string) []string {
	seen := make(map[string]bool)
	var out []string
	for _, kw := range skillKeywords {
		if kw.pattern.MatchString(message) {
			for _, s := range kw.skills {
				if !seen[s] {
					seen[s] = true
					out = append(out, s)
				}
			}
		}
	}
	return out
}
