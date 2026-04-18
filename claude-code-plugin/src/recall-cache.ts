import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { workspaceDataDir } from "./workspace-data-dir.js";

const DEFAULT_MAX = 100;

export interface PendingRecallEntry {
  promptHash: string;
  createdAt: number;
}

export interface ReadyRecallEntry {
  promptHash: string;
  context: string;
  createdAt: number;
  deliveredAt?: number;
}

export interface RecallSessionEntry {
  pending?: PendingRecallEntry;
  ready?: ReadyRecallEntry;
}

export interface RecallCacheConfig {
  maxSize: number;
  dataDir: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizePending(value: unknown): PendingRecallEntry | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.promptHash !== "string") return undefined;
  if (typeof value.createdAt !== "number") return undefined;
  return {
    promptHash: value.promptHash,
    createdAt: value.createdAt,
  };
}

function sanitizeReady(value: unknown): ReadyRecallEntry | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.promptHash !== "string") return undefined;
  if (typeof value.context !== "string") return undefined;
  if (typeof value.createdAt !== "number") return undefined;
  if (value.deliveredAt !== undefined && typeof value.deliveredAt !== "number") {
    return undefined;
  }
  return {
    promptHash: value.promptHash,
    context: value.context,
    createdAt: value.createdAt,
    deliveredAt: typeof value.deliveredAt === "number" ? value.deliveredAt : undefined,
  };
}

function sanitizeEntry(value: unknown): RecallSessionEntry | undefined {
  if (!isRecord(value)) return undefined;
  const pending = sanitizePending(value.pending);
  const ready = sanitizeReady(value.ready);
  if (!pending && !ready) return undefined;
  return { pending, ready };
}

export function hashPrompt(prompt: string): string {
  return createHash("sha1").update(prompt).digest("hex");
}

export class RecallCache {
  private filePath: string;
  private maxSize: number;

  constructor(config?: Partial<RecallCacheConfig>) {
    const dataDir = config?.dataDir ?? workspaceDataDir();
    this.maxSize = config?.maxSize ?? DEFAULT_MAX;
    this.filePath = join(dataDir, "claude-recall-cache.json");
    mkdirSync(dataDir, { recursive: true });
  }

  private readStore(): Record<string, RecallSessionEntry> {
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (!isRecord(parsed)) return {};

      const store: Record<string, RecallSessionEntry> = {};
      for (const [key, value] of Object.entries(parsed)) {
        const entry = sanitizeEntry(value);
        if (entry) store[key] = entry;
      }
      return store;
    } catch {
      return {};
    }
  }

  private writeStore(store: Record<string, RecallSessionEntry>): void {
    try {
      writeFileSync(this.filePath, JSON.stringify(store), "utf-8");
    } catch {
      // Best-effort — cache misses are acceptable.
    }
  }

  private trimStore(store: Record<string, RecallSessionEntry>): void {
    const keys = Object.keys(store);
    while (keys.length > this.maxSize) {
      const oldest = keys.shift();
      if (oldest !== undefined) delete store[oldest];
    }
  }

  private pruneEmptyEntry(store: Record<string, RecallSessionEntry>, sessionKey: string): void {
    const entry = store[sessionKey];
    if (!entry) return;
    if (!entry.pending && !entry.ready) {
      delete store[sessionKey];
    }
  }

  get(sessionKey: string): RecallSessionEntry | undefined {
    return this.readStore()[sessionKey];
  }

  list(): Record<string, RecallSessionEntry> {
    return this.readStore();
  }

  setPending(sessionKey: string, promptHash: string, now = Date.now()): void {
    const store = this.readStore();
    const current = store[sessionKey] ?? {};
    current.pending = { promptHash, createdAt: now };
    store[sessionKey] = current;
    this.trimStore(store);
    this.writeStore(store);
  }

  hasPending(sessionKey: string, promptHash: string, maxAgeMs: number, now = Date.now()): boolean {
    const store = this.readStore();
    const current = store[sessionKey];
    const pending = current?.pending;
    if (!pending) return false;
    if (now - pending.createdAt > maxAgeMs) {
      delete current.pending;
      this.pruneEmptyEntry(store, sessionKey);
      this.writeStore(store);
      return false;
    }
    return pending.promptHash === promptHash;
  }

  clearPending(sessionKey: string, promptHash?: string): boolean {
    const store = this.readStore();
    const current = store[sessionKey];
    if (!current?.pending) return false;
    if (promptHash && current.pending.promptHash !== promptHash) {
      return false;
    }
    delete current.pending;
    this.pruneEmptyEntry(store, sessionKey);
    this.writeStore(store);
    return true;
  }

  setReady(
    sessionKey: string,
    ready: { promptHash: string; context: string },
    now = Date.now(),
  ): void {
    const store = this.readStore();
    const current = store[sessionKey] ?? {};
    current.ready = {
      promptHash: ready.promptHash,
      context: ready.context,
      createdAt: now,
    };
    if (current.pending?.promptHash === ready.promptHash) {
      delete current.pending;
    }
    store[sessionKey] = current;
    this.trimStore(store);
    this.writeStore(store);
  }

  getInjectable(
    sessionKey: string,
    maxAgeMs: number,
    now = Date.now(),
  ): ReadyRecallEntry | undefined {
    const store = this.readStore();
    const current = store[sessionKey];
    const ready = current?.ready;
    if (!ready) return undefined;
    if (ready.deliveredAt !== undefined) return undefined;
    if (now - ready.createdAt > maxAgeMs) {
      delete current.ready;
      this.pruneEmptyEntry(store, sessionKey);
      this.writeStore(store);
      return undefined;
    }
    return ready;
  }

  markReadyDelivered(sessionKey: string, now = Date.now()): boolean {
    const store = this.readStore();
    const current = store[sessionKey];
    if (!current?.ready || current.ready.deliveredAt !== undefined) {
      return false;
    }
    current.ready.deliveredAt = now;
    this.writeStore(store);
    return true;
  }

  delete(sessionKey: string): boolean {
    const store = this.readStore();
    if (!(sessionKey in store)) return false;
    delete store[sessionKey];
    this.writeStore(store);
    return true;
  }

  clear(): void {
    this.writeStore({});
  }
}
