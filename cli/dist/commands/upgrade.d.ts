/**
 * `nex upgrade` — update the nex CLI to the latest version.
 *
 * Detects how nex was installed (bun global, global node_modules, etc.),
 * fetches the latest version from the registry, and runs the appropriate
 * install command.
 */
export declare function compareVersions(a: string, b: string): number;
export declare function runUpgrade(): Promise<void>;
