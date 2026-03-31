/**
 * XML context formatting and stripping for recall injection.
 * Wraps Nex answers in <nex-context> tags and strips them before capture.
 */
export interface NexRecallResult {
    answer: string;
    entityCount: number;
    sessionId?: string;
}
/**
 * Format a Nex /ask response as an XML block for context injection.
 */
export declare function formatNexContext(result: NexRecallResult): string;
/**
 * Strip all <nex-context>...</nex-context> blocks from text.
 * Also handles unclosed tags (strips from open tag to end of text).
 */
export declare function stripNexContext(text: string): string;
/**
 * Check if text contains a nex-context block.
 */
export declare function hasNexContext(text: string): boolean;
//# sourceMappingURL=context-format.d.ts.map