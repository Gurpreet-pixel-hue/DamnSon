import { describe, it, expect, beforeEach } from "vitest";
import { useTaskStore } from "@/lib/store/useTaskStore";
import { readTemplateFixture, readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import { journeyTemplateSchema, approvalModuleSchema } from "@/lib/contract/schema";
import { composeJourney } from "@/lib/contract/compose";
import { decodeShareState, encodeShareState, sanitizeShareState, type ShareState } from "@/lib/graph/shareState";

function loadTestJourney() {
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
  return composeJourney(template, modules, facts);
}

describe("Share Journey logic (P3 & P4 & §10.3)", () => {
  beforeEach(() => {
    useTaskStore.setState({
      activeTaskId: null,
      selectedStepId: null,
      factsByTask: {},
      completedByTask: {},
    });
  });

  it("encodes and decodes share state matching store values", () => {
    const journey = loadTestJourney();
    const taskId = "example-startup";

    useTaskStore.getState().setFact(taskId, "business.sector", "it_saas");
    useTaskStore.getState().setCompleted(taskId, ["ex-directors.kyc.1"]);

    const facts = useTaskStore.getState().factsByTask[taskId]!;
    const completed = useTaskStore.getState().completedByTask[taskId]!;

    const state: ShareState = sanitizeShareState({ taskId, facts, completed }, journey);
    const encoded = encodeShareState(state);
    const decoded = decodeShareState(new URLSearchParams(encoded));

    expect(decoded).not.toBeNull();
    expect(decoded?.taskId).toBe(taskId);
    expect(decoded?.facts).toEqual(facts);
    expect(decoded?.completed).toEqual(completed);
  });

  it("applies shared state to store updating facts and completed steps", () => {
    const taskId = "example-startup";
    const shared: ShareState = {
      taskId,
      facts: { "company.founders_count": 3 },
      completed: ["ex-directors.kyc.1", "ex-incorporation.file"],
    };

    useTaskStore.getState().setFacts(taskId, shared.facts);
    useTaskStore.getState().setCompleted(taskId, shared.completed);

    expect(useTaskStore.getState().factsByTask[taskId]).toEqual(shared.facts);
    expect(useTaskStore.getState().completedByTask[taskId]).toEqual(shared.completed);
  });
});
