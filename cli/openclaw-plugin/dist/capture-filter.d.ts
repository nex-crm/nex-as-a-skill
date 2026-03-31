/**
 * Smart capture filtering — decides what content to send to Nex for ingestion.
 * Cherry-picked from Supermemory (provider skip), Engram (dedup), MemOS Cloud (capture modes).
 */
import type { NexPluginConfig } from "./config.js";
/** Message shape from OpenClaw agent_end event. */
export interface AgentMessage {
    role: string;
    content?: string | Array<{
        type: string;
        text?: string;
    }>;
}
export interface CaptureFilterResult {
    text: string;
    skipped: false;
}
export interface CaptureFilterSkip {
    reason: string;
    skipped: true;
}
/**
 * Process agent_end event and decide what to capture.
 * Returns cleaned text or a skip reason.
 */
export declare function captureFilter(messages: AgentMessage[], config: NexPluginConfig, opts?: {
    messageProvider?: string;
    success?: boolean;
}): CaptureFilterResult | CaptureFilterSkip;
/** Reset dedup cache (for testing). */
export declare function resetDedupCache(): void;
//# sourceMappingURL=capture-filter.d.ts.map