import { describe, it, expect } from "bun:test";
import { streamText, splitIntoWordChunks } from "../../../src/tui/hooks/use-streaming.js";

// ─── splitIntoWordChunks ───

describe("splitIntoWordChunks", () => {
  it("splits text into word-level chunks", () => {
    const chunks = splitIntoWordChunks("hello world foo");
    expect(chunks.length).toBe(3);
    expect(chunks[0]).toBe("hello ");
    expect(chunks[1]).toBe("world ");
    expect(chunks[2]).toBe("foo");
  });

  it("handles single word", () => {
    const chunks = splitIntoWordChunks("hello");
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe("hello");
  });

  it("handles empty string", () => {
    const chunks = splitIntoWordChunks("");
    expect(chunks.length).toBe(0);
  });

  it("preserves multiple spaces between words", () => {
    const chunks = splitIntoWordChunks("a  b");
    // regex matches "a  " and "b"
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe("a  ");
    expect(chunks[1]).toBe("b");
  });

  it("handles whitespace-only string", () => {
    const chunks = splitIntoWordChunks("   ");
    // No \S+ matches, falls back to single chunk
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe("   ");
  });
});

// ─── streamText (async generator) ───

describe("streamText", () => {
  it("yields progressively longer word-level substrings", async () => {
    const text = "hello world foo";
    const chunks: string[] = [];

    for await (const { text: t } of streamText(text, { chunkMs: 1 })) {
      chunks.push(t);
    }

    expect(chunks.length).toBe(3);
    expect(chunks[0]).toBe("hello ");
    expect(chunks[1]).toBe("hello world ");
    expect(chunks[2]).toBe("hello world foo");
  });

  it("marks last chunk as not streaming", async () => {
    const text = "hi there";
    let lastState = { text: "", isStreaming: true };

    for await (const state of streamText(text, { chunkMs: 1 })) {
      lastState = state;
    }

    expect(lastState.text).toBe(text);
    expect(lastState.isStreaming).toBe(false);
  });

  it("marks intermediate chunks as streaming", async () => {
    const text = "one two three";
    const states: Array<{ text: string; isStreaming: boolean }> = [];

    for await (const state of streamText(text, { chunkMs: 1 })) {
      states.push(state);
    }

    expect(states[0].isStreaming).toBe(true);
    expect(states[1].isStreaming).toBe(true);
    expect(states[2].isStreaming).toBe(false);
  });

  it("handles empty text", async () => {
    const chunks: string[] = [];

    for await (const { text } of streamText("", { chunkMs: 1 })) {
      chunks.push(text);
    }

    expect(chunks.length).toBe(0);
  });

  it("handles single word", async () => {
    const chunks: string[] = [];

    for await (const { text } of streamText("hello", { chunkMs: 1 })) {
      chunks.push(text);
    }

    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe("hello");
  });

  it("completes immediately when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const chunks: Array<{ text: string; isStreaming: boolean }> = [];

    for await (const state of streamText("hello world", { chunkMs: 1 }, controller.signal)) {
      chunks.push(state);
    }

    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toBe("hello world");
    expect(chunks[0].isStreaming).toBe(false);
  });

  it("completes remaining text when signal aborts mid-stream", async () => {
    const controller = new AbortController();
    const text = "one two three four";
    const chunks: Array<{ text: string; isStreaming: boolean }> = [];

    for await (const state of streamText(text, { chunkMs: 1 }, controller.signal)) {
      chunks.push(state);
      if (chunks.length === 1) {
        controller.abort();
      }
    }

    expect(chunks.length >= 2).toBeTruthy();
    const last = chunks[chunks.length - 1];
    expect(last.text).toBe(text);
    expect(last.isStreaming).toBe(false);
  });
});
