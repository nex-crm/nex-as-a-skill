/**
 * In-memory session store mapping OpenClaw sessionKeys to Nex session IDs.
 * LRU eviction at configurable max size.
 */
export declare class SessionStore {
    private map;
    private maxSize;
    constructor(maxSize?: number);
    get(sessionKey: string): string | undefined;
    set(sessionKey: string, nexSessionId: string): void;
    delete(sessionKey: string): boolean;
    get size(): number;
    clear(): void;
}
//# sourceMappingURL=session-store.d.ts.map