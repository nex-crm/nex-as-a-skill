#!/usr/bin/env node

/**
 * Entry point.
 *
 * Interactive terminal → TUI (default)
 * --cmd <input>       → single command, print result, exit
 * Piped stdin         → read input, dispatch, exit
 */

import { dispatch, dispatchTokens, commandNames } from "./commands/dispatch.js";
import type { CommandContext } from "./commands/dispatch.js";

function extractFlag(args: string[], flag: string): { value: string | undefined; rest: string[] } {
  const idx = args.indexOf(flag);
  if (idx >= 0 && args[idx + 1]) {
    const value = args[idx + 1];
    const rest = [...args.slice(0, idx), ...args.slice(idx + 2)];
    return { value, rest };
  }
  return { value: undefined, rest: args };
}

function buildContext(args: string[]): { ctx: CommandContext; rest: string[] } {
  const { value: format, rest } = extractFlag(args, "--format");
  const ctx: CommandContext = {};
  if (format) ctx.format = format as CommandContext["format"];
  return { ctx, rest };
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const { ctx, rest: args } = buildContext(rawArgs);

  function emit(result: { output: string; error?: string; exitCode: number }): void {
    if (result.output) console.log(result.output);
    if (result.error) console.error(result.error);
  }

  // --cmd "ask who is important" → run one command and exit
  const cmdIdx = args.indexOf("--cmd");
  if (cmdIdx >= 0 && args[cmdIdx + 1]) {
    const input = args.slice(cmdIdx + 1).join(" ");
    const result = await dispatch(input, ctx);
    emit(result);
    process.exit(result.exitCode);
  }

  // Direct subcommand: `nex graph`, `nex scan`, etc. → dispatch and exit
  if (args.length > 0 && !args[0].startsWith("-")) {
    const candidate = args[0];
    const twoWord = args.length > 1 ? `${args[0]} ${args[1]}` : "";
    if (commandNames.includes(twoWord) || commandNames.includes(candidate)) {
      const result = await dispatchTokens(args, ctx);
      emit(result);
      process.exit(result.exitCode);
    }
    // Unknown subcommand — dispatch for error message instead of falling through to TUI
    const result = await dispatchTokens(args, ctx);
    emit(result);
    process.exit(result.exitCode);
  }

  // Piped stdin → dispatch each line
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    const input = Buffer.concat(chunks).toString("utf-8").trim();
    if (input) {
      const result = await dispatch(input, ctx);
      emit(result);
      process.exit(result.exitCode);
    }
    process.exit(0);
  }

  // Interactive terminal → TUI (no subcommand given)
  const { startTui } = await import("./tui/index.js");
  startTui();
}

main();
