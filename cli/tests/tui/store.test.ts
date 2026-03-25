import { describe, it, beforeEach, expect } from "bun:test";
import { createStore } from "../../src/tui/store.js";
import type { Store } from "../../src/tui/store.js";

describe("TUI Store", () => {
  let store: Store;

  beforeEach(() => {
    store = createStore();
  });

  // ── Initial state ──────────────────────────────────────────────

  it("initial mode is normal", () => {
    expect(store.getState().mode).toBe("normal");
  });

  it("initial viewStack contains home", () => {
    const stack = store.getState().viewStack;
    expect(stack.length).toBe(1);
    expect(stack[0].name).toBe("home");
  });

  it("initial pickerItems is null", () => {
    expect(store.getState().pickerItems).toBe(null);
  });

  it("initial inputValue is empty", () => {
    expect(store.getState().inputValue).toBe("");
  });

  it("initial scrollOffset is 0", () => {
    expect(store.getState().scrollOffset).toBe(0);
  });

  // ── PUSH_VIEW / POP_VIEW ──────────────────────────────────────

  it("PUSH_VIEW adds to viewStack", () => {
    store.dispatch({ type: "PUSH_VIEW", view: { name: "help" } });
    const stack = store.getState().viewStack;
    expect(stack.length).toBe(2);
    expect(stack[1].name).toBe("help");
  });

  it("PUSH_VIEW preserves props", () => {
    store.dispatch({
      type: "PUSH_VIEW",
      view: { name: "record-detail", props: { id: "abc" } },
    });
    const top = store.getState().viewStack[1];
    expect(top.props).toEqual({ id: "abc" });
  });

  it("POP_VIEW removes top entry", () => {
    store.dispatch({ type: "PUSH_VIEW", view: { name: "help" } });
    store.dispatch({ type: "PUSH_VIEW", view: { name: "record-list" } });
    expect(store.getState().viewStack.length).toBe(3);

    store.dispatch({ type: "POP_VIEW" });
    const stack = store.getState().viewStack;
    expect(stack.length).toBe(2);
    expect(stack[stack.length - 1].name).toBe("help");
  });

  it("POP_VIEW never pops below home", () => {
    store.dispatch({ type: "POP_VIEW" });
    store.dispatch({ type: "POP_VIEW" });
    expect(store.getState().viewStack.length).toBe(1);
    expect(store.getState().viewStack[0].name).toBe("home");
  });

  it("PUSH_VIEW resets scrollOffset", () => {
    store.dispatch({ type: "SCROLL", offset: 42 });
    expect(store.getState().scrollOffset).toBe(42);

    store.dispatch({ type: "PUSH_VIEW", view: { name: "help" } });
    expect(store.getState().scrollOffset).toBe(0);
  });

  it("viewStack max depth is 20", () => {
    for (let i = 0; i < 25; i++) {
      store.dispatch({ type: "PUSH_VIEW", view: { name: `view-${i}` } });
    }
    const stack = store.getState().viewStack;
    expect(stack.length <= 20).toBeTruthy();
    // Home should still be at index 0
    expect(stack[0].name).toBe("home");
    // Last pushed view should be at the end
    expect(stack[stack.length - 1].name).toBe("view-24");
  });

  // ── SET_MODE ──────────────────────────────────────────────────

  it("SET_MODE toggles to insert", () => {
    store.dispatch({ type: "SET_MODE", mode: "insert" });
    expect(store.getState().mode).toBe("insert");
  });

  it("SET_MODE toggles back to normal", () => {
    store.dispatch({ type: "SET_MODE", mode: "insert" });
    store.dispatch({ type: "SET_MODE", mode: "normal" });
    expect(store.getState().mode).toBe("normal");
  });

  // ── SET_CONTENT ───────────────────────────────────────────────

  it("SET_CONTENT updates content", () => {
    store.dispatch({ type: "SET_CONTENT", content: "hello world" });
    expect(store.getState().content).toBe("hello world");
  });

  // ── SET_LOADING ───────────────────────────────────────────────

  it("SET_LOADING sets loading and hint", () => {
    store.dispatch({ type: "SET_LOADING", loading: true, hint: "fetching..." });
    expect(store.getState().loading).toBe(true);
    expect(store.getState().loadingHint).toBe("fetching...");
  });

  it("SET_LOADING clears hint when not provided", () => {
    store.dispatch({ type: "SET_LOADING", loading: true, hint: "x" });
    store.dispatch({ type: "SET_LOADING", loading: false });
    expect(store.getState().loading).toBe(false);
    expect(store.getState().loadingHint).toBe("");
  });

  // ── SET_INPUT ─────────────────────────────────────────────────

  it("SET_INPUT updates inputValue", () => {
    store.dispatch({ type: "SET_INPUT", value: "record list" });
    expect(store.getState().inputValue).toBe("record list");
  });

  // ── SET_PICKER ────────────────────────────────────────────────

  it("SET_PICKER sets items and resets cursor", () => {
    const items = [
      { command: "cmd1", label: "Label 1", detail: "Detail 1" },
      { command: "cmd2", label: "Label 2", detail: "Detail 2" },
    ];
    store.dispatch({ type: "SET_PICKER", items });
    expect(store.getState().pickerItems).toEqual(items);
    expect(store.getState().pickerCursor).toBe(0);
  });

  it("SET_PICKER with cursor overrides default", () => {
    const items = [
      { command: "a", label: "A", detail: "a" },
      { command: "b", label: "B", detail: "b" },
    ];
    store.dispatch({ type: "SET_PICKER", items, cursor: 1 });
    expect(store.getState().pickerCursor).toBe(1);
  });

  it("SET_PICKER clears items", () => {
    store.dispatch({
      type: "SET_PICKER",
      items: [{ command: "x", label: "X", detail: "x" }],
    });
    store.dispatch({ type: "SET_PICKER", items: null });
    expect(store.getState().pickerItems).toBe(null);
  });

  // ── NAVIGATE ──────────────────────────────────────────────────

  it("NAVIGATE merges nav state", () => {
    store.dispatch({ type: "NAVIGATE", nav: { objectSlug: "person" } });
    expect(store.getState().nav.objectSlug).toBe("person");

    store.dispatch({ type: "NAVIGATE", nav: { recordId: "123" } });
    expect(store.getState().nav.objectSlug).toBe("person");
    expect(store.getState().nav.recordId).toBe("123");
  });

  // ── SCROLL ────────────────────────────────────────────────────

  it("SCROLL updates scrollOffset", () => {
    store.dispatch({ type: "SCROLL", offset: 10 });
    expect(store.getState().scrollOffset).toBe(10);
  });

  it("SCROLL clamps to 0", () => {
    store.dispatch({ type: "SCROLL", offset: -5 });
    expect(store.getState().scrollOffset).toBe(0);
  });

  // ── PUSH_HISTORY ──────────────────────────────────────────────

  it("PUSH_HISTORY adds to inputHistory", () => {
    store.dispatch({ type: "PUSH_HISTORY", command: "record list" });
    expect(store.getState().inputHistory).toEqual(["record list"]);
  });

  it("PUSH_HISTORY resets historyIndex", () => {
    store.dispatch({ type: "SET_HISTORY_INDEX", index: 2 });
    store.dispatch({ type: "PUSH_HISTORY", command: "search foo" });
    expect(store.getState().historyIndex).toBe(-1);
  });

  // ── SET_PICKER_CURSOR ─────────────────────────────────────────

  it("SET_PICKER_CURSOR updates cursor", () => {
    store.dispatch({ type: "SET_PICKER_CURSOR", cursor: 5 });
    expect(store.getState().pickerCursor).toBe(5);
  });

  // ── subscribe / unsubscribe ───────────────────────────────────

  it("subscribe fires on dispatch", () => {
    let callCount = 0;
    store.subscribe(() => {
      callCount++;
    });

    store.dispatch({ type: "SET_MODE", mode: "insert" });
    expect(callCount).toBe(1);

    store.dispatch({ type: "SET_MODE", mode: "normal" });
    expect(callCount).toBe(2);
  });

  it("unsubscribe stops notifications", () => {
    let callCount = 0;
    const unsub = store.subscribe(() => {
      callCount++;
    });

    store.dispatch({ type: "SET_MODE", mode: "insert" });
    expect(callCount).toBe(1);

    unsub();
    store.dispatch({ type: "SET_MODE", mode: "normal" });
    expect(callCount).toBe(1); // no increase
  });

  it("setState merges and notifies", () => {
    let called = false;
    store.subscribe(() => {
      called = true;
    });

    store.setState({ content: "direct" });
    expect(store.getState().content).toBe("direct");
    expect(called).toBeTruthy();
  });

  // ── SET_LAST_KEY ──────────────────────────────────────────────

  it("SET_LAST_KEY records key and time", () => {
    store.dispatch({ type: "SET_LAST_KEY", key: "g", time: 12345 });
    expect(store.getState().lastKey).toBe("g");
    expect(store.getState().lastKeyTime).toBe(12345);
  });
});
