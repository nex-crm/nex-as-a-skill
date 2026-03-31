/**
 * HTTP client for the Nex Developer API.
 * Uses native fetch with AbortController timeouts.
 */
// --- Error types ---
export class NexAuthError extends Error {
    constructor(message = "Invalid or missing API key") {
        super(message);
        this.name = "NexAuthError";
    }
}
export class NexRateLimitError extends Error {
    retryAfterMs;
    constructor(retryAfterMs = 60_000) {
        super(`Rate limited — retry after ${retryAfterMs}ms`);
        this.name = "NexRateLimitError";
        this.retryAfterMs = retryAfterMs;
    }
}
export class NexServerError extends Error {
    status;
    constructor(status, body) {
        super(`Nex API error ${status}${body ? `: ${body}` : ""}`);
        this.name = "NexServerError";
        this.status = status;
    }
}
// --- Client ---
export class NexClient {
    apiKey;
    baseUrl;
    constructor(apiKey, baseUrl) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }
    async request(method, path, body, timeoutMs = 10_000) {
        const url = `${this.baseUrl}/api/developers${path}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const headers = {
                Authorization: `Bearer ${this.apiKey}`,
                "X-Nex-Source": "skill",
            };
            if (body !== undefined) {
                headers["Content-Type"] = "application/json";
            }
            const res = await fetch(url, {
                method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
            if (res.status === 401 || res.status === 403) {
                throw new NexAuthError();
            }
            if (res.status === 429) {
                const retryAfter = res.headers.get("retry-after");
                const ms = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60_000;
                throw new NexRateLimitError(ms);
            }
            if (!res.ok) {
                let body;
                try {
                    body = await res.text();
                }
                catch {
                    // ignore
                }
                throw new NexServerError(res.status, body);
            }
            const text = await res.text();
            if (!text)
                return {};
            return JSON.parse(text);
        }
        finally {
            clearTimeout(timer);
        }
    }
    /** Generic GET request. */
    async get(path, timeoutMs) {
        return this.request("GET", path, undefined, timeoutMs);
    }
    /** Generic POST request. */
    async post(path, body, timeoutMs) {
        return this.request("POST", path, body, timeoutMs);
    }
    /** Generic DELETE request. */
    async delete(path, timeoutMs) {
        return this.request("DELETE", path, undefined, timeoutMs);
    }
    /** Generic PATCH request. */
    async patch(path, body, timeoutMs) {
        return this.request("PATCH", path, body, timeoutMs);
    }
    /** Generic PUT request. */
    async put(path, body, timeoutMs) {
        return this.request("PUT", path, body, timeoutMs);
    }
    /** Ingest text content into the Nex knowledge graph. */
    async ingest(content, context) {
        const body = { content };
        if (context)
            body.context = context;
        return this.request("POST", "/v1/context/text", body, 60_000);
    }
    /** Ask a question against the Nex knowledge graph. */
    async ask(query, sessionId, timeoutMs) {
        const body = { query };
        if (sessionId)
            body.session_id = sessionId;
        return this.request("POST", "/v1/context/ask", body, timeoutMs);
    }
    /** Lightweight health check — validates API key connectivity. */
    async healthCheck() {
        try {
            // Use a minimal ask call with short timeout
            await this.request("POST", "/v1/context/ask", { query: "ping" }, 5000);
            return true;
        }
        catch (err) {
            if (err instanceof NexAuthError)
                throw err; // Auth errors should propagate
            return false; // Network/server errors = unhealthy but not fatal
        }
    }
}
//# sourceMappingURL=nex-client.js.map