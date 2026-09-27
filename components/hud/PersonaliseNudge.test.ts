import { describe, it, expect, beforeEach } from "vitest";
import { useTaskStore } from "@/lib/store/useTaskStore";
import type { ComposedJourney } from "@/lib/contract/compose";
import type { MetroVM } from "@/lib/graph/viewModel";

describe("PersonaliseNudge logic (A3)", () => {
  beforeEach(() => {
    useTaskStore.setState({
      activeTaskId: "test-task",
      factsByTask: { "test-task": {} },
    });
  });

  const mockJourney: ComposedJourney = {
    taskId: "test-task",
    revision: 1,
    title: "Test Task",
    summary: "Testing",
    jurisdiction: { country: "IN", state: "Maharashtra" },
    category: "business_and_trade",
    questions: [
      {
        fact: "business.entity_type",
        text: "What type of company will you register?",
        answerType: "enum",
        affectedStepCount: 5,
        options: [
          { value: "private_limited", label: "Private Limited" },
          { value: "opc", label: "One Person Company" },
        ],
      },
    ],
    facts: {},
    steps: [],
    edges: [],
    excluded: [],
  };

  const mockMetroWithMayApply: MetroVM = {
    stations: [
      { id: "s1", title: "Step 1", kind: "government", officeType: null, mode: null, state: "available", applicability: "may_apply", layer: 0, lane: 0, position3D: [0, 0, 0], position2D: { x: 0, y: 0 } },
      { id: "s2", title: "Step 2", kind: "government", officeType: null, mode: null, state: "locked", applicability: "may_apply", layer: 1, lane: 0, position3D: [1, 0, 0], position2D: { x: 1, y: 0 } },
      { id: "s3", title: "Step 3", kind: "government", officeType: null, mode: null, state: "locked", applicability: "applies", layer: 2, lane: 0, position3D: [2, 0, 0], position2D: { x: 2, y: 0 } },
    ],
    tracks: [],
  };

  const mockMetroAllApplies: MetroVM = {
    stations: [
      { id: "s1", title: "Step 1", kind: "government", officeType: null, mode: null, state: "available", applicability: "applies", layer: 0, lane: 0, position3D: [0, 0, 0], position2D: { x: 0, y: 0 } },
      { id: "s2", title: "Step 2", kind: "government", officeType: null, mode: null, state: "locked", applicability: "applies", layer: 1, lane: 0, position3D: [1, 0, 0], position2D: { x: 1, y: 0 } },
      { id: "s3", title: "Step 3", kind: "government", officeType: null, mode: null, state: "locked", applicability: "may_apply", layer: 2, lane: 0, position3D: [2, 0, 0], position2D: { x: 2, y: 0 } },
    ],
    tracks: [],
  };

  it("qualifies when at least half the stations are may_apply and question is unanswered", () => {
    const mayApplyCount = mockMetroWithMayApply.stations.filter(s => s.applicability === "may_apply").length;
    expect(mayApplyCount).toBe(2);
    expect(mayApplyCount >= mockMetroWithMayApply.stations.length / 2).toBe(true);

    const factVal = useTaskStore.getState().factsByTask["test-task"]?.[mockJourney.questions[0]!.fact];
    expect(factVal).toBeUndefined();
  });

  it("does not qualify when less than half the stations are may_apply", () => {
    const mayApplyCount = mockMetroAllApplies.stations.filter(s => s.applicability === "may_apply").length;
    expect(mayApplyCount).toBe(1);
    expect(mayApplyCount >= mockMetroAllApplies.stations.length / 2).toBe(false);
  });

  it("setting the fact resolves the unanswered condition", () => {
    useTaskStore.getState().setFact("test-task", "business.entity_type", "private_limited");
    const factVal = useTaskStore.getState().factsByTask["test-task"]?.["business.entity_type"];
    expect(factVal).toBe("private_limited");
  });
});
