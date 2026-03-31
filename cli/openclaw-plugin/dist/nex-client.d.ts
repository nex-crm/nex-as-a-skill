/**
 * HTTP client for the Nex Developer API.
 * Uses native fetch with AbortController timeouts.
 */
export declare class NexAuthError extends Error {
    constructor(message?: string);
}
export declare class NexRateLimitError extends Error {
    retryAfterMs: number;
    constructor(retryAfterMs?: number);
}
export declare class NexServerError extends Error {
    status: number;
    constructor(status: number, body?: string);
}
export interface IngestResponse {
    artifact_id: string;
}
export interface EntityReference {
    id?: number;
    name: string;
    type: string;
    count?: number;
}
export interface AskResponse {
    answer: string;
    session_id?: string;
    entity_references?: EntityReference[];
}
export declare class NexClient {
    private apiKey;
    private baseUrl;
    constructor(apiKey: string, baseUrl: string);
    private request;
    /** Generic GET request. */
    get<T = unknown>(path: string, timeoutMs?: number): Promise<T>;
    /** Generic POST request. */
    post<T = unknown>(path: string, body?: unknown, timeoutMs?: number): Promise<T>;
    /** Generic DELETE request. */
    delete<T = unknown>(path: string, timeoutMs?: number): Promise<T>;
    /** Generic PATCH request. */
    patch<T = unknown>(path: string, body?: unknown, timeoutMs?: number): Promise<T>;
    /** Generic PUT request. */
    put<T = unknown>(path: string, body?: unknown, timeoutMs?: number): Promise<T>;
    /** Ingest text content into the Nex knowledge graph. */
    ingest(content: string, context?: string): Promise<IngestResponse>;
    /** Ask a question against the Nex knowledge graph. */
    ask(query: string, sessionId?: string, timeoutMs?: number): Promise<AskResponse>;
    /** Lightweight health check — validates API key connectivity. */
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=nex-client.d.ts.map