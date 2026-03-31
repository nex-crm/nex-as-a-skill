/**
 * Plugin configuration parsing and validation.
 * Resolves API key from config, env var, or ${VAR} interpolation.
 */
export interface NexPluginConfig {
    apiKey: string;
    baseUrl: string;
    autoRecall: boolean;
    autoCapture: boolean;
    captureMode: "last_turn" | "full_session";
    maxRecallResults: number;
    sessionTracking: boolean;
    recallTimeoutMs: number;
    debug: boolean;
}
export declare class ConfigError extends Error {
    constructor(message: string);
}
/**
 * Parse raw plugin config into a validated NexPluginConfig.
 * Falls back to process.env.NEX_API_KEY if no apiKey in config.
 */
export declare function parseConfig(raw?: Record<string, unknown>): NexPluginConfig;
//# sourceMappingURL=config.d.ts.map