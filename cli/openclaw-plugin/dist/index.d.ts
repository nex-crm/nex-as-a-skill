/**
 * Nex Memory Plugin for OpenClaw
 *
 * Gives OpenClaw agents persistent long-term memory powered by the Nex
 * context intelligence layer. Auto-recalls relevant context before each
 * agent turn and auto-captures conversation facts after each turn.
 */
interface Logger {
    debug?(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
}
interface PluginHookAgentContext {
    agentId?: string;
    sessionKey?: string;
    sessionId?: string;
    workspaceDir?: string;
    messageProvider?: string;
}
interface BeforeAgentStartEvent {
    prompt: string;
    messages?: unknown[];
}
interface AgentEndEvent {
    messages: unknown[];
    success: boolean;
    error?: unknown;
    durationMs?: number;
}
interface PluginCommandContext {
    args?: string;
    commandBody: string;
}
interface ToolCallResult {
    content: Array<{
        type: string;
        text: string;
    }>;
    details: unknown;
}
interface OpenClawPluginApi {
    id: string;
    name: string;
    pluginConfig?: Record<string, unknown>;
    logger: Logger;
    on(hookName: "before_agent_start", handler: (event: BeforeAgentStartEvent, ctx: PluginHookAgentContext) => Promise<{
        prependContext?: string;
    } | void> | {
        prependContext?: string;
    } | void, opts?: {
        priority?: number;
    }): void;
    on(hookName: "agent_end", handler: (event: AgentEndEvent, ctx: PluginHookAgentContext) => Promise<void> | void, opts?: {
        priority?: number;
    }): void;
    registerTool(tool: {
        name: string;
        label: string;
        description: string;
        parameters: unknown;
        execute: (toolCallId: string, params: Record<string, unknown>, signal?: AbortSignal) => Promise<ToolCallResult>;
        ownerOnly?: boolean;
    }): void;
    registerCommand(command: {
        name: string;
        description: string;
        acceptsArgs?: boolean;
        handler: (ctx: PluginCommandContext) => Promise<{
            text: string;
        }> | {
            text: string;
        };
    }): void;
    registerService(service: {
        id: string;
        start: (ctx: {
            logger: Logger;
        }) => Promise<void> | void;
        stop?: (ctx: {
            logger: Logger;
        }) => Promise<void> | void;
    }): void;
}
declare const plugin: {
    id: string;
    name: string;
    description: string;
    version: string;
    kind: "memory";
    register(api: OpenClawPluginApi): void;
};
export default plugin;
//# sourceMappingURL=index.d.ts.map