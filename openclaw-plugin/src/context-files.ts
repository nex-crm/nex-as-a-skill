/**
 * Ingests OpenClaw context files into Nex.
 *
 * Reads from project-level locations:
 * - {cwd}/CLAUDE.md (project instructions, if exists)
 * - {cwd}/.openclaw/ config directory (any .md/.yaml/.json files)
 *
 * Uses the file manifest for change detection — unchanged files are skipped.
 */
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { readManifest, writeManifest, isChanged, markIngested } from "./file-manifest.js";
import type { NexClient } from "./nex-client.js";
import type { RateLimiter } from "./rate-limiter.js";

const MAX_FILE_SIZE = 100_000;
const CONTEXT_EXTENSIONS = new Set([".md", ".yaml", ".yml", ".json", ".txt"]);

interface ContextFileCandidate {
  path: string;
  contextTag: string;
}

/**
 * Collect all context file paths to check.
 */
function collectContextFiles(cwd: string): ContextFileCandidate[] {
  const files: ContextFileCandidate[] = [];

  // 1. Project CLAUDE.md
  const projectClaude = join(cwd, "CLAUDE.md");
  if (existsSync(projectClaude)) {
    files.push({ path: projectClaude, contextTag: "claude-md:project" });
  }

  // 2. .openclaw/ config directory
  const openclawDir = join(cwd, ".openclaw");
  if (existsSync(openclawDir)) {
    try {
      const entries = readdirSync(openclawDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = extname(entry.name).toLowerCase();
        if (!CONTEXT_EXTENSIONS.has(ext)) continue;
        const fullPath = join(openclawDir, entry.name);
        const name = basename(entry.name, ext);
        files.push({ path: fullPath, contextTag: `openclaw-config:${name}` });
      }
    } catch {
      // openclawDir unreadable — skip silently
    }
  }

  return files;
}

export interface ContextFilesResult {
  ingested: number;
  skipped: number;
  errors: number;
  files: string[];
}

/**
 * Ingest changed context files into Nex.
 */
export async function ingestContextFiles(
  client: NexClient,
  cwd: string,
  rateLimiter?: RateLimiter,
): Promise<ContextFilesResult> {
  const result: ContextFilesResult = { ingested: 0, skipped: 0, errors: 0, files: [] };
  const manifest = readManifest();
  const candidates = collectContextFiles(cwd);
  let dirty = false;

  for (const { path, contextTag } of candidates) {
    try {
      const stat = statSync(path);
      if (!isChanged(path, stat, manifest)) {
        result.skipped++;
        continue;
      }

      if (rateLimiter && !rateLimiter.canProceed()) {
        process.stderr.write("[nex-context-files] Rate limited — stopping context file ingest\n");
        result.skipped += candidates.length - result.ingested - result.skipped - result.errors;
        break;
      }

      let content = readFileSync(path, "utf-8");
      if (content.length > MAX_FILE_SIZE) {
        content = content.slice(0, MAX_FILE_SIZE) + "\n[...truncated]";
      }

      await client.ingest(content, contextTag);
      if (rateLimiter) rateLimiter.recordRequest();
      markIngested(path, stat, contextTag, manifest);
      result.ingested++;
      result.files.push(contextTag);
      dirty = true;
    } catch (err) {
      process.stderr.write(
        `[nex-context-files] Failed to ingest ${contextTag}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      result.errors++;
    }
  }

  if (dirty) {
    writeManifest(manifest);
  }
  return result;
}
