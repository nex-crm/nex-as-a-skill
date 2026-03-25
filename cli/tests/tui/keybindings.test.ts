import { describe, it, expect } from "bun:test";
import { handleKey, parseKey } from "../../src/tui/keybindings.js";
import type { TuiState, Action } from "../../src/tui/store.js";

// ── Helpers ────────────────────────────────────────────────────────

function makeState(overrides: Partial<TuiState> = {}): TuiState {
  return {
    mode: "normal",
    viewStack: [{ name: "home" }],
    nav: {},
    pickerItems: null,
    pickerCursor: 0,
    content: "",
    loading: false,
    loadingHint: "",
    inputValue: "",
    inputHistory: [],
    historyIndex: -1,
    scrollOffset: 0,
    lastKey: "",
    lastKeyTime: 0,
    ...overrides,
  };
}

function collectDispatches(
  rawInput: string,
  state: TuiState,
): Action[] {
  const actions: Action[] = [];
  handleKey(rawInput, state, (action) => actions.push(action));
  return actions;
}

// ── parseKey tests ─────────────────────────────────────────────────

describe("parseKey", () => {
  it("parses printable lowercase", () => {
    const k = parseKey("a");
    expect(k.name).toBe("a");
    expect(k.ctrl).toBe(false);
    expect(k.shift).toBe(false);
  });

  it("parses uppercase as shift", () => {
    const k = parseKey("G");
    expect(k.name).toBe("G");
    expect(k.shift).toBe(true);
  });

  it("parses Ctrl+d", () => {
    const k = parseKey("\x04"); // Ctrl+D = 0x04
    expect(k.name).toBe("d");
    expect(k.ctrl).toBe(true);
  });

  it("parses Ctrl+u", () => {
    const k = parseKey("\x15"); // Ctrl+U = 0x15
    expect(k.name).toBe("u");
    expect(k.ctrl).toBe(true);
  });

  it("parses escape", () => {
    const k = parseKey("\x1b");
    expect(k.name).toBe("escape");
  });

  it("parses return", () => {
    const k = parseKey("\r");
    expect(k.name).toBe("return");
  });

  it("parses tab", () => {
    const k = parseKey("\t");
    expect(k.name).toBe("tab");
  });

  it("parses up arrow", () => {
    const k = parseKey("\x1b[A");
    expect(k.name).toBe("up");
  });

  it("parses down arrow", () => {
    const k = parseKey("\x1b[B");
    expect(k.name).toBe("down");
  });
});

// ── Normal mode tests ──────────────────────────────────────────────

describe("keybindings: normal mode", () => {
  it("i switches to insert mode", () => {
    const actions = collectDispatches("i", makeState());
    expect(actions.length).toBe(1);
    expect(actions[0]).toEqual({ type: "SET_MODE", mode: "insert" });
  });

  it("/ switches to insert mode and sets input", () => {
    const actions = collectDispatches("/", makeState());
    expect(actions.length).toBe(2);
    expect(actions[0]).toEqual({ type: "SET_MODE", mode: "insert" });
    expect(actions[1]).toEqual({ type: "SET_INPUT", value: "/" });
  });

  it("? pushes help view", () => {
    const actions = collectDispatches("?", makeState());
    expect(actions.length).toBe(1);
    expect(actions[0].type).toBe("PUSH_VIEW");
    if (actions[0].type === "PUSH_VIEW") {
      expect(actions[0].view.name).toBe("help");
    }
  });

  it("j scrolls down when no picker", () => {
    const actions = collectDispatches("j", makeState({ scrollOffset: 5 }));
    expect(actions.length).toBe(1);
    expect(actions[0]).toEqual({ type: "SCROLL", offset: 6 });
  });

  it("k scrolls up when no picker", () => {
    const actions = collectDispatches("k", makeState({ scrollOffset: 5 }));
    expect(actions.length).toBe(1);
    expect(actions[0]).toEqual({ type: "SCROLL", offset: 4 });
  });

  it("j moves picker cursor down", () => {
    const items = [
      { command: "a", label: "A", detail: "a" },
      { command: "b", label: "B", detail: "b" },
    ];
    const actions = collectDispatches(
      "j",
      makeState({ pickerItems: items, pickerCursor: 0 }),
    );
    expect(actions.length).toBe(1);
    expect(actions[0]).toEqual({ type: "SET_PICKER_CURSOR", cursor: 1 });
  });

  it("k moves picker cursor up", () => {
    const items = [
      { command: "a", label: "A", detail: "a" },
      { command: "b", label: "B", detail: "b" },
    ];
    const actions = collectDispatches(
      "k",
      makeState({ pickerItems: items, pickerCursor: 1 }),
    );
    expect(actions.length).toBe(1);
    expect(actions[0]).toEqual({ type: "SET_PICKER_CURSOR", cursor: 0 });
  });

  it("G scrolls to bottom (Infinity)", () => {
    const actions = collectDispatches("G", makeState());
    expect(actions.length).toBe(1);
    expect(actions[0]).toEqual({ type: "SCROLL", offset: Infinity });
  });

  it("gg (double tap) scrolls to top", () => {
    const now = Date.now();
    const state = makeState({ lastKey: "g", lastKeyTime: now });
    const actions = collectDispatches("g", state);
    // Should produce SCROLL to 0 and clear lastKey
    const scrollAction = actions.find(
      (a) => a.type === "SCROLL" && "offset" in a && a.offset === 0,
    );
    expect(scrollAction).toBeTruthy();
  });

  it("single g just records lastKey", () => {
    const actions = collectDispatches("g", makeState());
    expect(actions.length).toBe(1);
    expect(actions[0].type).toBe("SET_LAST_KEY");
    if (actions[0].type === "SET_LAST_KEY") {
      expect(actions[0].key).toBe("g");
    }
  });

  it("Escape pops view", () => {
    const actions = collectDispatches("\x1b", makeState());
    expect(actions.length).toBe(1);
    expect(actions[0]).toEqual({ type: "POP_VIEW" });
  });

  it("Ctrl+d scrolls half page down", () => {
    const actions = collectDispatches("\x04", makeState({ scrollOffset: 0 }));
    expect(actions.length).toBe(1);
    expect(actions[0]).toEqual({ type: "SCROLL", offset: 15 });
  });

  it("Ctrl+u scrolls half page up", () => {
    const actions = collectDispatches("\x15", makeState({ scrollOffset: 20 }));
    expect(actions.length).toBe(1);
    expect(actions[0]).toEqual({ type: "SCROLL", offset: 5 });
  });

  it("number keys quick-select picker item", () => {
    const items = [
      { command: "cmd1", label: "1", detail: "d1" },
      { command: "cmd2", label: "2", detail: "d2" },
      { command: "cmd3", label: "3", detail: "d3" },
    ];
    const actions = collectDispatches(
      "2",
      makeState({ pickerItems: items }),
    );
    // Should set cursor to 1 and switch to insert with cmd2
    const cursorAction = actions.find(
      (a) => a.type === "SET_PICKER_CURSOR",
    );
    expect(cursorAction).toBeTruthy();
    if (cursorAction && cursorAction.type === "SET_PICKER_CURSOR") {
      expect(cursorAction.cursor).toBe(1);
    }
    const modeAction = actions.find((a) => a.type === "SET_MODE");
    expect(modeAction).toBeTruthy();
  });

  it("q calls process.exit", () => {
    const originalExit = process.exit;
    let exitCalled = false;
    process.exit = ((_code?: number) => {
      exitCalled = true;
    }) as typeof process.exit;

    try {
      collectDispatches("q", makeState());
      expect(exitCalled).toBeTruthy();
    } finally {
      process.exit = originalExit;
    }
  });
});

// ── Insert mode tests ──────────────────────────────────────────────

describe("keybindings: insert mode", () => {
  it("Escape switches to normal mode", () => {
    const actions = collectDispatches("\x1b", makeState({ mode: "insert" }));
    expect(actions.length).toBe(1);
    expect(actions[0]).toEqual({ type: "SET_MODE", mode: "normal" });
  });

  it("Enter pushes history when inputValue is non-empty", () => {
    const actions = collectDispatches(
      "\r",
      makeState({ mode: "insert", inputValue: "record list" }),
    );
    expect(actions.length).toBe(1);
    expect(actions[0]).toEqual({
      type: "PUSH_HISTORY",
      command: "record list",
    });
  });

  it("Enter does not push empty input to history", () => {
    const actions = collectDispatches(
      "\r",
      makeState({ mode: "insert", inputValue: "" }),
    );
    expect(actions.length).toBe(0);
  });

  it("Up arrow navigates history", () => {
    const history = ["first", "second", "third"];
    const actions = collectDispatches(
      "\x1b[A",
      makeState({ mode: "insert", inputHistory: history }),
    );
    // Should set historyIndex to last and set input
    const idxAction = actions.find((a) => a.type === "SET_HISTORY_INDEX");
    expect(idxAction).toBeTruthy();
    if (idxAction && idxAction.type === "SET_HISTORY_INDEX") {
      expect(idxAction.index).toBe(2); // last item
    }
  });

  it("Down arrow navigates history forward", () => {
    const history = ["first", "second"];
    const actions = collectDispatches(
      "\x1b[B",
      makeState({ mode: "insert", inputHistory: history, historyIndex: 0 }),
    );
    const idxAction = actions.find((a) => a.type === "SET_HISTORY_INDEX");
    expect(idxAction).toBeTruthy();
    if (idxAction && idxAction.type === "SET_HISTORY_INDEX") {
      expect(idxAction.index).toBe(1);
    }
  });

  it("Tab autocompletes matching command", () => {
    const actions = collectDispatches(
      "\t",
      makeState({ mode: "insert", inputValue: "record l" }),
    );
    const inputAction = actions.find((a) => a.type === "SET_INPUT");
    expect(inputAction).toBeTruthy();
    if (inputAction && inputAction.type === "SET_INPUT") {
      expect(inputAction.value).toBe("record list");
    }
  });

  it("Tab does nothing when no match", () => {
    const actions = collectDispatches(
      "\t",
      makeState({ mode: "insert", inputValue: "zzzz" }),
    );
    const inputAction = actions.find((a) => a.type === "SET_INPUT");
    expect(inputAction).toBe(undefined);
  });

  it("regular keys in insert mode produce no dispatch", () => {
    const actions = collectDispatches(
      "a",
      makeState({ mode: "insert" }),
    );
    expect(actions.length).toBe(0);
  });
});
