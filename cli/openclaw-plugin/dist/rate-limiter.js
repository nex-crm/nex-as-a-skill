/**
 * Sliding window rate limiter with async queue.
 * Designed for Nex /text endpoint (10 req/min).
 */
const DEFAULTS = {
    maxRequests: 10,
    windowMs: 60_000,
    maxQueueDepth: 5,
};
export class RateLimiter {
    timestamps = [];
    queue = [];
    draining = false;
    config;
    timer = null;
    constructor(config) {
        this.config = { ...DEFAULTS, ...config };
    }
    /** Enqueue a function to be executed within rate limits. Fire-and-forget. */
    enqueue(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            // LIFO eviction: if queue exceeds max depth, drop oldest (front)
            while (this.queue.length > this.config.maxQueueDepth) {
                const dropped = this.queue.shift();
                dropped.reject(new Error("Rate limiter queue full — request dropped (LIFO eviction)"));
            }
            this.drain();
        });
    }
    canProceed() {
        const now = Date.now();
        // Remove timestamps outside the window
        this.timestamps = this.timestamps.filter((t) => now - t < this.config.windowMs);
        return this.timestamps.length < this.config.maxRequests;
    }
    msUntilSlot() {
        if (this.timestamps.length === 0)
            return 0;
        const oldest = this.timestamps[0];
        return Math.max(0, this.config.windowMs - (Date.now() - oldest));
    }
    async drain() {
        if (this.draining)
            return;
        this.draining = true;
        try {
            while (this.queue.length > 0) {
                if (this.canProceed()) {
                    const item = this.queue.shift();
                    this.timestamps.push(Date.now());
                    try {
                        await item.fn();
                        item.resolve();
                    }
                    catch (err) {
                        item.reject(err instanceof Error ? err : new Error(String(err)));
                    }
                }
                else {
                    // Wait until a slot opens
                    const wait = this.msUntilSlot();
                    await new Promise((r) => {
                        this.timer = setTimeout(r, wait);
                    });
                }
            }
        }
        finally {
            this.draining = false;
        }
    }
    /** Flush pending queue (called on shutdown). */
    async flush() {
        // Let current drain finish
        while (this.draining || this.queue.length > 0) {
            await new Promise((r) => setTimeout(r, 50));
        }
    }
    /** Cancel all pending and stop timers. */
    destroy() {
        if (this.timer)
            clearTimeout(this.timer);
        for (const item of this.queue) {
            item.reject(new Error("Rate limiter destroyed"));
        }
        this.queue.length = 0;
        this.timestamps.length = 0;
    }
    /** Current queue depth (for debugging). */
    get pending() {
        return this.queue.length;
    }
}
//# sourceMappingURL=rate-limiter.js.map