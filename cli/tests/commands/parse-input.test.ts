import { describe, it, expect } from "bun:test";
import { parseInput } from "../../src/commands/parse-input.js";

describe("parseInput", () => {
  it("returns empty array for empty string", () => {
    expect(parseInput("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(parseInput("   ")).toEqual([]);
  });

  it("parses a single command word", () => {
    expect(parseInput("objects")).toEqual(["objects"]);
  });

  it("parses multiple words", () => {
    expect(parseInput("record list person --limit 10")).toEqual([
      "record",
      "list",
      "person",
      "--limit",
      "10",
    ]);
  });

  it("handles double-quoted strings", () => {
    expect(parseInput('ask "hello world"')).toEqual(["ask", "hello world"]);
  });

  it("handles single-quoted strings", () => {
    expect(parseInput("remember 'this is a note'")).toEqual([
      "remember",
      "this is a note",
    ]);
  });

  it("handles JSON in single quotes", () => {
    expect(
      parseInput("record create person --data '{\"name\":\"John\"}'"),
    ).toEqual(["record", "create", "person", "--data", '{"name":"John"}']);
  });

  it("handles mixed quotes and plain tokens", () => {
    expect(
      parseInput('ask "who is the CEO?" --format json'),
    ).toEqual(["ask", "who is the CEO?", "--format", "json"]);
  });

  it("handles extra spaces between tokens", () => {
    expect(parseInput("  ask   hello  ")).toEqual(["ask", "hello"]);
  });

  it("handles empty quoted strings", () => {
    expect(parseInput('ask ""')).toEqual(["ask"]);
  });

  it("handles adjacent tokens without spaces after quotes", () => {
    // Edge case: quotes in the middle of a token
    expect(parseInput('hello"world"')).toEqual(["helloworld"]);
  });

  it("preserves content inside quotes with special characters", () => {
    expect(
      parseInput('search "O\'Brien & Co."'),
    ).toEqual(["search", "O'Brien & Co."]);
  });
});
