import { describe, it, expect } from "vitest";
import { createTaskStore, selectCompleted, selectFacts } from "./useTaskStore";

// React's useSyncExternalStore (which zustand v5 uses) re-renders forever if a selector returns a
// new reference while the store is unchanged ("The result of getSnapshot should be cached").
// A journey a visitor has never opened has no entry in the store, so the fallback is what runs.
describe("task store selectors return stable references", () => {
  it("returns the same facts reference for a task with no saved state", () => {
    const state = createTaskStore().getState();
    const select = selectFacts("never-opened");
    expect(select(state)).toBe(select(state));
    expect(select(state)).toBe(selectFacts("another-unopened-task")(state));
  });

  it("returns the same completed-steps reference for a task with no saved state", () => {
    const state = createTaskStore().getState();
    const select = selectCompleted("never-opened");
    expect(select(state)).toBe(select(state));
    expect(select(state)).toBe(selectCompleted("another-unopened-task")(state));
  });

  it("returns the saved value when the task has state", () => {
    const store = createTaskStore();
    store.getState().setCompleted("t1", ["a", "b"]);
    expect(selectCompleted("t1")(store.getState())).toEqual(["a", "b"]);
    expect(selectCompleted("t1")(store.getState())).toBe(selectCompleted("t1")(store.getState()));
  });

  it("starts empty", () => {
    const state = createTaskStore().getState();
    expect(selectFacts("x")(state)).toEqual({});
    expect(selectCompleted("x")(state)).toEqual([]);
  });
});
