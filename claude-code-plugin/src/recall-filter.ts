/**
 * Minimal recall filter for Claude Code.
 *
 * The intended behavior is to query Nex for nearly every user message and
 * skip only clearly low-signal input such as very short replies, explicit
 * opt-outs, or raw shell commands. Natural-language coding prompts still go
 * through Ask so memory is available during regular coding turns.
 */

const MIN_RECALL_LENGTH = 15;
const NATURAL_LANGUAGE_HINTS =
  /\b(please|can|could|would|should|what|when|where|why|how|who|tell|explain|describe|summarize|check|review|look|find|show|help|about|for|to|with|without|into|from|before|after|need|want|current|my|our|this|that)\b/i;
const BARE_SHELL_COMMAND =
  /^(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*(?:ls|pwd|cd|cat|grep|rg|find|mkdir|rm|cp|mv|touch|echo|git|npm|npx|yarn|pnpm|bun|node|python|python3|pytest|make|docker|kubectl|terraform)\b/i;
const COMMAND_TOKEN =
  /^(?:[A-Za-z_][A-Za-z0-9_]*=\S+|--?[\w./:=@%+,~-]+|[\w./:=@%+,~-]+|["'][^"']*["'])$/;

export interface RecallDecision {
  shouldRecall: boolean;
  reason: string;
}

function looksLikeBareShellCommand(prompt: string): boolean {
  if (!BARE_SHELL_COMMAND.test(prompt)) {
    return false;
  }

  if (NATURAL_LANGUAGE_HINTS.test(prompt)) {
    return false;
  }

  return prompt.split(/\s+/).every((token) => COMMAND_TOKEN.test(token));
}

export function shouldRecall(prompt: string, isFirstPrompt: boolean): RecallDecision {
  const trimmed = prompt.trim();

  // Explicit opt-out: prompt starts with !
  if (trimmed.startsWith("!")) {
    return { shouldRecall: false, reason: "opt-out" };
  }

  if (trimmed.length < MIN_RECALL_LENGTH) {
    return { shouldRecall: false, reason: "too-short" };
  }

  if (looksLikeBareShellCommand(trimmed)) {
    return { shouldRecall: false, reason: "bare-shell-command" };
  }

  if (isFirstPrompt) {
    return { shouldRecall: true, reason: "first-prompt" };
  }

  return { shouldRecall: true, reason: "default" };
}
