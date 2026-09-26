import { describe, it, expect } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { createTaskStore } from "./useTaskStore";

class MemoryStorage implements StateStorage {
  private store = new Map<string, string>();

  getItem(name: string): string | null {
    return this.store.get(name) ?? null;
  }

  setItem(name: string, value: string): void {
    this.store.set(name, value);
  }

  removeItem(name: string): void {
    this.store.delete(name);
  }
}

describe("useTaskStore", () => {
  it("toggles step completion immutably and per task", () => {
    const memory = new MemoryStorage();
    const store = createTaskStore(memory);

    expect(store.getState().completedByTask).toEqual({});

    store.getState().toggleStepDone("task-a", "step-1");
    expect(store.getState().completedByTask["task-a"]).toEqual(["step-1"]);
    expect(store.getState().completedByTask["task-b"]).toBeUndefined();

    store.getState().toggleStepDone("task-a", "step-2");
    expect(store.getState().completedByTask["task-a"]).toEqual([
      "step-1",
      "step-2",
    ]);

    store.getState().toggleStepDone("task-a", "step-1");
    expect(store.getState().completedByTask["task-a"]).toEqual(["step-2"]);
  });

  it("sets and clears answers immutably and per task", () => {
    const memory = new MemoryStorage();
    const store = createTaskStore(memory);

    expect(store.getState().answersByTask).toEqual({});

    store.getState().setAnswer("task-1", "q1", true);
    store.getState().setAnswer("task-1", "q2", false);
    store.getState().setAnswer("task-2", "q1", false);

    expect(store.getState().answersByTask["task-1"]).toEqual({
      q1: true,
      q2: false,
    });
    expect(store.getState().answersByTask["task-2"]).toEqual({
      q1: false,
    });

    store.getState().clearAnswers("task-1");
    expect(store.getState().answersByTask["task-1"]).toEqual({});
    expect(store.getState().answersByTask["task-2"]).toEqual({
      q1: false,
    });
  });

  it("migrates legacy persisted state by defaulting missing fields", async () => {
    const memory = new MemoryStorage();
    // Simulate legacy storage containing only completedByTask and no answersByTask
    memory.setItem(
      "damnson-progress-v1",
      JSON.stringify({
        state: {
          completedByTask: { "task-legacy": ["step-done"] },
        },
        version: 0,
      })
    );

    const store = createTaskStore(memory);
    await store.persist.rehydrate();
    expect(store.getState().completedByTask["task-legacy"]).toEqual([
      "step-done",
    ]);
    expect(store.getState().answersByTask).toEqual({});
  });

  it("handles corrupted storage by rehydrating broken fields to empty objects without throwing", async () => {
    const memory = new MemoryStorage();
    memory.setItem(
      "damnson-progress-v1",
      JSON.stringify({
        state: {
          completedByTask: "x",
          answersByTask: { t: { q: "yes" } },
        },
        version: 1,
      })
    );

    const store = createTaskStore(memory);
    await store.persist.rehydrate();
    expect(store.getState().completedByTask).toEqual({});
    expect(store.getState().answersByTask).toEqual({});
  });

  it("round-trips valid persisted storage cleanly", async () => {
    const memory = new MemoryStorage();
    const validData = {
      completedByTask: { "task-1": ["s1", "s2"] },
      answersByTask: { "task-1": { q1: true, q2: false } },
    };
    memory.setItem(
      "damnson-progress-v1",
      JSON.stringify({
        state: validData,
        version: 1,
      })
    );

    const store = createTaskStore(memory);
    await store.persist.rehydrate();
    expect(store.getState().completedByTask).toEqual(validData.completedByTask);
    expect(store.getState().answersByTask).toEqual(validData.answersByTask);
  });
});
