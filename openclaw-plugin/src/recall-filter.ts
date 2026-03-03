/**
 * Smart prompt classifier for selective recall.
 *
 * Determines whether a prompt is likely knowledge-seeking (needs recall)
 * or a pure coding directive (skip recall). Also handles debounce —
 * skips recall if a successful recall happened within the debounce window,
 * unless the current prompt contains question words.
 *
 * OpenClaw adaptation: uses in-memory state (long-lived process)
 * instead of file-based persistence (CC hooks are ephemeral).
 */

const DEBOUNCE_MS = 30_000; // 30 seconds

// --- Question words that signal knowledge-seeking intent ---
const QUESTION_WORDS =
  /\b(who|what|when|where|why|how|which|tell|explain|describe|summarize|summarise|list|find|show|get|any|does|did|is|are|was|were|have|has|do|can|could|should|would|will)\b/i;

// --- Tool/action commands that are pure coding directives ---
const TOOL_COMMANDS =
  /^\s*(run|build|test|lint|format|deploy|install|uninstall|start|stop|restart|commit|push|pull|merge|rebase|checkout|fetch|init|fix|refactor|rename|move|delete|remove|add|create|update|upgrade|downgrade|migrate|generate|scaffold|compile|bundle|watch|serve|debug|profile|bench|clean|reset|undo|redo|revert|squash|cherry-pick|tag|release|publish|npm|npx|yarn|pnpm|bun|pip|cargo|go|make|docker|kubectl|terraform|git|gh|cd|ls|cat|grep|find|mkdir|rm|cp|mv|touch|echo|export|source|chmod|chown|curl|wget|ssh|scp)\b/i;

// --- File reference pattern (paths, extensions) ---
const FILE_REF = /(?:[\w./\\-]+\.\w{1,10}|src\/|lib\/|dist\/|node_modules\/|\.\/|\.\.\/)/;

// --- Code-heavy: >50% non-alpha characters (brackets, operators, etc.) ---
function isCodeHeavy(text: string): boolean {
  const alpha = text.replace(/[^a-zA-Z]/g, "").length;
  return alpha < text.length * 0.5;
}

export interface RecallDecision {
  shouldRecall: boolean;
  reason: string;
}

/**
 * In-memory recall filter for long-lived OpenClaw plugin process.
 * Tracks debounce state and first-prompt detection per session.
 */
export class RecallFilter {
  private lastRecallAt = 0;
  private seenSessions = new Set<string>();

  /** Check if this is the first prompt for a given session key. */
  isFirstPrompt(sessionKey?: string): boolean {
    if (!sessionKey) return true;
    if (this.seenSessions.has(sessionKey)) return false;
    this.seenSessions.add(sessionKey);
    // Limit set size to prevent unbounded growth
    if (this.seenSessions.size > 1000) {
      const iter = this.seenSessions.values();
      this.seenSessions.delete(iter.next().value!);
    }
    return true;
  }

  /** Record that a successful recall just happened. */
  recordRecall(): void {
    this.lastRecallAt = Date.now();
  }

  /** Determine whether this prompt should trigger a Nex /ask recall. */
  shouldRecall(prompt: string, isFirstPrompt: boolean): RecallDecision {
    const trimmed = prompt.trim();

    // Always recall on first prompt of session
    if (isFirstPrompt) {
      return { shouldRecall: true, reason: "first-prompt" };
    }

    // Explicit opt-out: prompt starts with !
    if (trimmed.startsWith("!")) {
      return { shouldRecall: false, reason: "opt-out" };
    }

    // Too short — likely a directive like "yes", "ok", "done"
    if (trimmed.length < 15) {
      return { shouldRecall: false, reason: "too-short" };
    }

    // Has question words — likely knowledge-seeking
    const hasQuestion = QUESTION_WORDS.test(trimmed);

    // Check debounce: skip if recent successful recall, unless question
    if (!hasQuestion) {
      if (this.lastRecallAt > 0 && Date.now() - this.lastRecallAt < DEBOUNCE_MS) {
        return { shouldRecall: false, reason: "debounce" };
      }
    }

    // Tool/action commands — pure coding directives
    if (TOOL_COMMANDS.test(trimmed) && !hasQuestion) {
      return { shouldRecall: false, reason: "tool-command" };
    }

    // Code-heavy with file references and no question words
    if (isCodeHeavy(trimmed) && FILE_REF.test(trimmed) && !hasQuestion) {
      return { shouldRecall: false, reason: "code-prompt" };
    }

    // Has question words — always recall
    if (hasQuestion) {
      return { shouldRecall: true, reason: "question" };
    }

    // Default: recall (err on the side of providing context)
    return { shouldRecall: true, reason: "default" };
  }
}
