/**
 * Sliding window rate limiter with async queue.
 * Designed for Nex /text endpoint (10 req/min).
 */
export interface RateLimiterConfig {
    maxRequests: number;
    windowMs: number;
    maxQueueDepth: number;
}
export declare class RateLimiter {
    private timestamps;
    private queue;
    private draining;
    private config;
    private timer;
    constructor(config?: Partial<RateLimiterConfig>);
    /** Enqueue a function to be executed within rate limits. Fire-and-forget. */
    enqueue(fn: () => Promise<void>): Promise<void>;
    private canProceed;
    private msUntilSlot;
    private drain;
    /** Flush pending queue (called on shutdown). */
    flush(): Promise<void>;
    /** Cancel all pending and stop timers. */
    destroy(): void;
    /** Current queue depth (for debugging). */
    get pending(): number;
}
//# sourceMappingURL=rate-limiter.d.ts.map