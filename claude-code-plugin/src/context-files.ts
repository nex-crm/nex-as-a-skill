/**
 * Ingests Claude Code context files (CLAUDE.md + memory files) into Nex.
 *
 * Reads from both global and project-level locations:
 * - ~/.claude/CLAUDE.md (global instructions)
 * - {cwd}/CLAUDE.md (project instructions)
 * - ~/.claude/projects/{project-key}/memory/MEMORY.md (auto-memory)
 * - ~/.claude/projects/{project-key}/memory/*.md (topic memory files)
 *
 * Uses the file manifest for change detection — unchanged files are skipped.
 */

import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { homedir } from "node:os";
import type { NexClient } from "./nex-client.js";
import type { RateLimiter } from "./rate-limiter.js";
import { readManifest, writeManifest, isChanged, markIngested } from "./file-manifest.js";

const CLAUDE_DIR = join(homedir(), ".claude");
const INGEST_TIMEOUT_MS = readTimeoutEnv("NEX_CONTEXT_FILES_TIMEOUT_MS", 10_000);
const TOTAL_BUDGET_MS = readTimeoutEnv("NEX_CONTEXT_FILES_TOTAL_BUDGET_MS", 12_000);
const CONTEXT_FILES_ENABLED = (process.env.NEX_CONTEXT_FILES_ENABLED ?? "true").toLowerCase() !== "false";
const MAX_FILE_SIZE = 100_000;

export interface ContextFilesResult {
  ingested: number;
  skipped: number;
  errors: number;
  files: string[]; // context tags of ingested files
}

function readTimeoutEnv(name: string, fallbackMs: number): number {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/**
 * Derive the Claude Code project key from a cwd path.
 * e.g. /Users/foo/bar → -Users-foo-bar
 */
function projectKey(cwd: string): string {
  return cwd.replace(/\//g, "-");
}

/**
 * Collect all context file paths to check.
 */
function collectContextFiles(cwd: string): Array<{ path: string; contextTag: string }> {
  const files: Array<{ path: string; contextTag: string }> = [];
  const key = projectKey(cwd);

  // 1. Project CLAUDE.md
  const projectClaude = join(cwd, "CLAUDE.md");
  if (existsSync(projectClaude)) {
    files.push({ path: projectClaude, contextTag: "claude-md:project" });
  }

  // 2. Global CLAUDE.md
  const globalClaude = join(CLAUDE_DIR, "CLAUDE.md");
  if (existsSync(globalClaude)) {
    files.push({ path: globalClaude, contextTag: "claude-md:global" });
  }

  // 3. Memory files: ~/.claude/projects/{key}/memory/*.md
  const memoryDir = join(CLAUDE_DIR, "projects", key, "memory");
  if (existsSync(memoryDir)) {
    try {
      const entries = readdirSync(memoryDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (extname(entry.name).toLowerCase() !== ".md") continue;
        const fullPath = join(memoryDir, entry.name);
        const name = basename(entry.name, ".md");
        files.push({ path: fullPath, contextTag: `claude-memory:${name}` });
      }
    } catch {
      // memoryDir unreadable — skip silently
    }
  }

  return files;
}

/**
 * Ingest changed CLAUDE.md and memory files into Nex.
 */
export async function ingestContextFiles(
  client: NexClient,
  rateLimiter: RateLimiter,
  cwd: string
): Promise<ContextFilesResult> {
  const result: ContextFilesResult = { ingested: 0, skipped: 0, errors: 0, files: [] };
  if (!CONTEXT_FILES_ENABLED) {
    return result;
  }
  const manifest = readManifest();
  const candidates = collectContextFiles(cwd);
  let dirty = false;
  const startedAt = Date.now();

  for (let i = 0; i < candidates.length; i++) {
    const { path, contextTag } = candidates[i];
    try {
      const remainingBudgetMs = TOTAL_BUDGET_MS - (Date.now() - startedAt);
      if (remainingBudgetMs <= 0) {
        result.skipped += candidates.length - i;
        break;
      }

      const stat = statSync(path);
      if (!isChanged(path, stat, manifest)) {
        result.skipped++;
        continue;
      }

      if (!rateLimiter.canProceed()) {
        process.stderr.write("[nex-context-files] Rate limited — stopping context file ingest\n");
        result.skipped += candidates.length - result.ingested - result.skipped - result.errors;
        break;
      }

      let content = readFileSync(path, "utf-8");
      if (content.length > MAX_FILE_SIZE) {
        content = content.slice(0, MAX_FILE_SIZE) + "\n[...truncated]";
      }

      await client.ingest(content, contextTag, Math.min(INGEST_TIMEOUT_MS, remainingBudgetMs));
      markIngested(path, stat, contextTag, manifest);
      result.ingested++;
      result.files.push(contextTag);
      dirty = true;
    } catch (err) {
      if (isAbortError(err)) {
        // Optional preload only: stop here and let SessionStart continue with Ask.
        result.skipped += candidates.length - i;
        break;
      }
      process.stderr.write(
        `[nex-context-files] Failed to ingest ${contextTag}: ${err instanceof Error ? err.message : String(err)}\n`
      );
      result.errors++;
    }
  }

  if (dirty) {
    writeManifest(manifest);
  }

  return result;
}
