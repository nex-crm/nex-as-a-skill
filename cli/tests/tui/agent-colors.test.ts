import { describe, it, beforeEach, expect } from "bun:test";
import {
  getAgentColor,
  getAllAgentColors,
  resetAgentColors,
} from "../../src/tui/agent-colors.js";

describe("agent-colors", () => {
  beforeEach(() => {
    resetAgentColors();
  });

  it("assigns a color on first encounter", () => {
    const color = getAgentColor("seo-analyst");
    expect(color).toBeTruthy();
    expect(
      ["cyan", "green", "yellow", "magenta", "blue", "red"].includes(color),
    ).toBeTruthy();
  });

  it("returns the same color for the same slug", () => {
    const first = getAgentColor("lead-gen");
    const second = getAgentColor("lead-gen");
    expect(first).toBe(second);
  });

  it("assigns different colors to different slugs", () => {
    const a = getAgentColor("agent-a");
    const b = getAgentColor("agent-b");
    expect(a).not.toBe(b);
  });

  it("cycles through all six palette colors", () => {
    const slugs = ["a", "b", "c", "d", "e", "f"];
    const colors = slugs.map((s) => getAgentColor(s));

    // All six should be unique
    const unique = new Set(colors);
    expect(unique.size).toBe(6);
  });

  it("wraps around after exhausting the palette", () => {
    const slugs = ["a", "b", "c", "d", "e", "f", "g"];
    const colors = slugs.map((s) => getAgentColor(s));

    // The 7th should wrap to the same color as the 1st
    expect(colors[6]).toBe(colors[0]);
  });

  it("getAllAgentColors returns the current map", () => {
    getAgentColor("alpha");
    getAgentColor("beta");
    const map = getAllAgentColors();
    expect(map.size).toBe(2);
    expect(map.has("alpha")).toBeTruthy();
    expect(map.has("beta")).toBeTruthy();
  });

  it("resetAgentColors clears all assignments", () => {
    const before = getAgentColor("test");
    resetAgentColors();
    // After reset, the first slug gets the first palette color again
    const after = getAgentColor("different-slug");
    expect(before).toBe(after);
    expect(getAllAgentColors().size).toBe(1);
  });
});
