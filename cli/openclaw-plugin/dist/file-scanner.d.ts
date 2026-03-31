/**
 * File scanner for OpenClaw plugin.
 * Discovers text files, tracks changes via SHA-256 content hash,
 * and ingests new/changed files into Nex.
 */
import { NexClient } from "./nex-client.js";
export interface ScanResult {
    scanned: number;
    skipped: number;
    errors: number;
    files: Array<{
        path: string;
        status: string;
        reason?: string;
    }>;
}
export declare function scanFiles(dir: string, client: NexClient, opts?: {
    extensions?: string[];
    maxFiles?: number;
    depth?: number;
    force?: boolean;
}): Promise<ScanResult>;
//# sourceMappingURL=file-scanner.d.ts.map