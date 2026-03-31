/**
 * In-memory session store mapping OpenClaw sessionKeys to Nex session IDs.
 * LRU eviction at configurable max size.
 */
const DEFAULT_MAX = 1000;
export class SessionStore {
    map = new Map();
    maxSize;
    constructor(maxSize = DEFAULT_MAX) {
        this.maxSize = maxSize;
    }
    get(sessionKey) {
        const value = this.map.get(sessionKey);
        if (value !== undefined) {
            // Move to end (most recently used)
            this.map.delete(sessionKey);
            this.map.set(sessionKey, value);
        }
        return value;
    }
    set(sessionKey, nexSessionId) {
        // If already exists, delete first to update position
        if (this.map.has(sessionKey)) {
            this.map.delete(sessionKey);
        }
        this.map.set(sessionKey, nexSessionId);
        // LRU eviction
        while (this.map.size > this.maxSize) {
            const oldest = this.map.keys().next().value;
            this.map.delete(oldest);
        }
    }
    delete(sessionKey) {
        return this.map.delete(sessionKey);
    }
    get size() {
        return this.map.size;
    }
    clear() {
        this.map.clear();
    }
}
//# sourceMappingURL=session-store.js.map