import { describe, it, expect } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { createTaskStore } from "./useTaskStore";
import { canMarkDone, deriveStepStates } from "@/lib/graph/progress";
import { sanitizeShareState } from "@/lib/graph/shareState";
import { readTemplateFixture, readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import { journeyTemplateSchema, approvalModuleSchema } from "@/lib/contract/schema";
import { composeJourney } from "@/lib/contract/compose";

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

function loadExampleStartupJourney() {
  const template = journeyTemplateSchema.parse(
    readTemplateFixture("example-startup")
  );
  const moduleNames = [
    "ex-directors",
    "ex-incorporation",
    "ex-banking",
    "ex-tax",
    "ex-food",
    "ex-recognition",
    "ex-local",
  ];
  const modules = moduleNames.map((name) =>
    approvalModuleSchema.parse(readModuleFixture(name))
  );
  const facts = {
    "business.sector": "it_saas",
    "company.founders_count": 2,
    "employees.count": 5,
  };
  const journey = composeJourney(template, modules, facts);
  return { journey, facts };
}

describe("useTaskStore v2", () => {
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

  it("sets and clears facts immutably and per task", () => {
    const memory = new MemoryStorage();
    const store = createTaskStore(memory);

    expect(store.getState().factsByTask).toEqual({});

    store.getState().setFact("task-1", "business.sector", "it_saas");
    store.getState().setFact("task-1", "company.founders_count", 2);
    store.getState().setFact("task-2", "employees.count", 15);

    expect(store.getState().factsByTask["task-1"]).toEqual({
      "business.sector": "it_saas",
      "company.founders_count": 2,
    });
    expect(store.getState().factsByTask["task-2"]).toEqual({
      "employees.count": 15,
    });

    store.getState().clearFact("task-1", "company.founders_count");
    expect(store.getState().factsByTask["task-1"]).toEqual({
      "business.sector": "it_saas",
    });

    store.getState().setFacts("task-1", {
      "business.sector": "food_service",
      "employees.count": 10,
    });
    expect(store.getState().factsByTask["task-1"]).toEqual({
      "business.sector": "food_service",
      "employees.count": 10,
    });
  });

  it("discards v1 legacy persisted state on migration", async () => {
    const memory = new MemoryStorage();
    memory.setItem(
      "damnson-progress-v2",
      JSON.stringify({
        state: {
          completedByTask: { "task-v1": ["step-old"] },
          answersByTask: { "task-v1": { q: true } },
        },
        version: 1,
      })
    );

    const store = createTaskStore(memory);
    await store.persist.rehydrate();
    expect(store.getState().completedByTask).toEqual({});
    expect(store.getState().factsByTask).toEqual({});
  });

  it("handles corrupted storage by rehydrating broken fields to empty objects without throwing", async () => {
    const memory = new MemoryStorage();
    memory.setItem(
      "damnson-progress-v2",
      JSON.stringify({
        state: {
          completedByTask: "not-an-object",
          factsByTask: "not-an-object",
        },
        version: 2,
      })
    );

    const store = createTaskStore(memory);
    await store.persist.rehydrate();
    expect(store.getState().completedByTask).toEqual({});
    expect(store.getState().factsByTask).toEqual({});
  });

  it("round-trips valid persisted storage cleanly", async () => {
    const memory = new MemoryStorage();
    const validData = {
      completedByTask: { "task-1": ["s1", "s2"] },
      factsByTask: { "task-1": { "business.sector": "it_saas" } },
    };
    memory.setItem(
      "damnson-progress-v2",
      JSON.stringify({
        state: validData,
        version: 2,
      })
    );

    const store = createTaskStore(memory);
    await store.persist.rehydrate();
    expect(store.getState().completedByTask).toEqual(validData.completedByTask);
    expect(store.getState().factsByTask).toEqual(validData.factsByTask);
  });

  it("enforces milestone guards per C1: canMarkDone, deriveStepStates, sanitizeShareState", () => {
    // 1. canMarkDone is false for milestones
    expect(canMarkDone("milestone")).toBe(false);
    expect(canMarkDone("government")).toBe(true);

    // 2. A milestone id in completed doesn't change any state
    const { journey } = loadExampleStartupJourney();
    const statesWithout = deriveStepStates(journey, new Set());
    const statesWithMilestone = deriveStepStates(
      journey,
      new Set(["ex-incorporation.incorporated"])
    );
    expect(statesWithMilestone).toEqual(statesWithout);
    expect(statesWithMilestone.get("ex-incorporation.incorporated")).toBe("locked");

    // 3. sanitize drops a milestone id
    const sanitized = sanitizeShareState(
      {
        taskId: "example-startup",
        facts: {},
        completed: ["ex-incorporation.incorporated", "ex-incorporation.file"],
      },
      journey
    );
    expect(sanitized.completed).toEqual(["ex-incorporation.file"]);
  });

  it("sets completed steps immutably via setCompleted", () => {
    const memory = new MemoryStorage();
    const store = createTaskStore(memory);

    store.getState().setCompleted("task-x", ["step-1", "step-2"]);
    expect(store.getState().completedByTask["task-x"]).toEqual(["step-1", "step-2"]);

    store.getState().setCompleted("task-x", ["step-3"]);
    expect(store.getState().completedByTask["task-x"]).toEqual(["step-3"]);
  });

  it("handles mark done, downstream unlock, and undo restoration per §10.7", () => {
    const memory = new MemoryStorage();
    const store = createTaskStore(memory);
    const { journey } = loadExampleStartupJourney();

    const taskId = "example-startup";
    const initialCompleted = new Set<string>();
    const initialStates = deriveStepStates(journey, initialCompleted);

    // Initial state: KYC 1 & 2 are available, incorporation file is locked
    expect(initialStates.get("ex-directors.kyc.1")).toBe("available");
    expect(initialStates.get("ex-directors.kyc.2")).toBe("available");
    expect(initialStates.get("ex-incorporation.file")).toBe("locked");

    // Complete first founder KYC: incorporation file remains locked
    store.getState().toggleStepDone(taskId, "ex-directors.kyc.1");
    expect(store.getState().completedByTask[taskId]).toEqual(["ex-directors.kyc.1"]);
    const partialStates = deriveStepStates(journey, new Set(store.getState().completedByTask[taskId]));
    expect(partialStates.get("ex-directors.kyc.1")).toBe("done");
    expect(partialStates.get("ex-incorporation.file")).toBe("locked");

    // Complete second founder KYC: incorporation file unlocks to available
    store.getState().toggleStepDone(taskId, "ex-directors.kyc.2");
    const fullKYCStates = deriveStepStates(journey, new Set(store.getState().completedByTask[taskId]));
    expect(fullKYCStates.get("ex-directors.kyc.2")).toBe("done");
    expect(fullKYCStates.get("ex-incorporation.file")).toBe("available");

    // Citizen completes incorporation file: milestone unlocks/completes automatically (PRD §8.8)
    store.getState().toggleStepDone(taskId, "ex-incorporation.file");
    const afterIncorpStates = deriveStepStates(journey, new Set(store.getState().completedByTask[taskId]));
    expect(afterIncorpStates.get("ex-incorporation.file")).toBe("done");
    expect(afterIncorpStates.get("ex-incorporation.incorporated")).toBe("done");

    // Citizen clicks Undo / Mark as not done on incorporation file: restores previous state exactly
    store.getState().toggleStepDone(taskId, "ex-incorporation.file");
    const afterUndoStates = deriveStepStates(journey, new Set(store.getState().completedByTask[taskId]));
    expect(afterUndoStates.get("ex-incorporation.file")).toBe("available");
    expect(afterUndoStates.get("ex-incorporation.incorporated")).toBe("locked");
  });
});
