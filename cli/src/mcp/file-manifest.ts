/**
 * Persistent file manifest — tracks which files have been ingested
 * using mtime + size as change detection.
 *
 * Stored at <workspaceDataDir>/file-scan-manifest.json.
 */
import { readFileSync, writeFileSync, mkdirSync, type Stats } from "node:fs";
import { join } from "node:path";
import { workspaceDataDir } from "./workspace-data-dir.js";

function dataDir(): string {
  return workspaceDataDir();
}

function manifestPath(): string {
  return join(dataDir(), "file-scan-manifest.json");
}

export interface FileManifestEntry {
  mtime: number;
  size: number;
  ingestedAt: number;
  context: string;
}

export interface FileManifest {
  version: 1;
  lastScanAt?: number; // Date.now() of last completed scan
  files: Record<string, FileManifestEntry>;
}

export function readManifest(): FileManifest {
  try {
    const raw = readFileSync(manifestPath(), "utf-8");
    const data = JSON.parse(raw);
    if (data && data.version === 1 && data.files) {
      return data;
    }
    return { version: 1, files: {} };
  } catch {
    return { version: 1, files: {} };
  }
}

export function writeManifest(manifest: FileManifest): void {
  try {
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(manifestPath(), JSON.stringify(manifest, null, 2), "utf-8");
  } catch {
    // Best-effort — if we can't write, next scan re-ingests
  }
}

export function isChanged(path: string, stat: Stats, manifest: FileManifest): boolean {
  const entry = manifest.files[path];
  if (!entry) return true;
  return entry.mtime !== stat.mtimeMs || entry.size !== stat.size;
}

export function markIngested(path: string, stat: Stats, context: string, manifest: FileManifest): void {
  manifest.files[path] = {
    mtime: stat.mtimeMs,
    size: stat.size,
    ingestedAt: Date.now(),
    context,
  };
}

/**
 * Record that a full scan completed at this moment.
 */
export function markScanned(manifest: FileManifest): void {
  manifest.lastScanAt = Date.now();
}

/**
 * Check if a scan completed recently (within the given window).
 * Default window: 1 hour.
 */
const DEFAULT_SCAN_FRESHNESS_MS = 60 * 60 * 1000; // 1 hour

export function isScanFresh(manifest: FileManifest, windowMs = DEFAULT_SCAN_FRESHNESS_MS): boolean {
  if (!manifest.lastScanAt) return false;
  return Date.now() - manifest.lastScanAt < windowMs;
}
