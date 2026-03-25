import { describe, it, beforeEach, expect } from "bun:test";
import {
  getChannelColor,
  resetChannelColors,
} from "../../src/tui/channel-colors.js";

describe("channel-colors", () => {
  beforeEach(() => {
    resetChannelColors();
  });

  it("assigns well-known colors for standard channels", () => {
    expect(getChannelColor("general")).toBe("cyan");
    expect(getChannelColor("leads")).toBe("green");
    expect(getChannelColor("seo")).toBe("yellow");
    expect(getChannelColor("support")).toBe("magenta");
  });

  it("is case-insensitive for well-known channels", () => {
    expect(getChannelColor("General")).toBe("cyan");
    expect(getChannelColor("LEADS")).toBe("green");
  });

  it("returns stable color for same channel name", () => {
    const first = getChannelColor("custom-channel");
    const second = getChannelColor("custom-channel");
    expect(first).toBe(second);
  });

  it("assigns different colors to different unknown channels", () => {
    const a = getChannelColor("alpha");
    const b = getChannelColor("beta");
    expect(a).not.toBe(b);
  });

  it("cycles through palette for unknown channels", () => {
    const names = ["x1", "x2", "x3", "x4", "x5", "x6"];
    const colors = names.map((n) => getChannelColor(n));
    const unique = new Set(colors);
    expect(unique.size).toBe(6);
  });

  it("wraps around after exhausting palette", () => {
    const names = ["x1", "x2", "x3", "x4", "x5", "x6", "x7"];
    const colors = names.map((n) => getChannelColor(n));
    expect(colors[6]).toBe(colors[0]);
  });

  it("resetChannelColors clears all assignments", () => {
    getChannelColor("custom");
    resetChannelColors();
    // After reset, well-known channels still work
    expect(getChannelColor("general")).toBe("cyan");
  });
});
