import { describe, it, expect } from "vitest";
import { buildStageTrayModel } from "./stageTray";
import type { MetroVM, StationVM } from "./viewModel";
import type { ComposedJourney, ComposedStep } from "@/lib/contract/compose";

describe("buildStageTrayModel (§12.3)", () => {
  const mockStations: StationVM[] = [
    {
      id: "mca.incorporate",
      title: "Incorporate Company",
      kind: "government",
      officeType: "online_portal",
      mode: "online",
      state: "available",
      applicability: "applies",
      layer: 3, // Stage 4 (0-based layer 3)
      lane: 0,
      position3D: [0, 0, 0],
      position2D: { x: 0, y: 0 },
    },
    {
      id: "pt.ptec",
      title: "PTEC Registration",
      kind: "government",
      officeType: "revenue_office",
      mode: "online",
      state: "available",
      applicability: "applies",
      layer: 3,
      lane: 1,
      position3D: [1, 0, 0],
      position2D: { x: 1, y: 0 },
    },
    {
      id: "pt.ptrc",
      title: "PTRC Registration",
      kind: "government",
      officeType: "revenue_office",
      mode: "in_person",
      state: "locked",
      applicability: "may_apply",
      layer: 3,
      lane: 2,
      position3D: [2, 0, 0],
      position2D: { x: 2, y: 0 },
    },
    {
      id: "fssai.reg",
      title: "FSSAI Food Licence",
      kind: "government",
      officeType: "health_department",
      mode: "online",
      state: "locked",
      applicability: "may_apply",
      layer: 3,
      lane: 3,
      position3D: [3, 0, 0],
      position2D: { x: 3, y: 0 },
    },
  ];

  const mockMetro: MetroVM = {
    stations: mockStations,
    tracks: [],
  };

  const mockJourney: Partial<ComposedJourney> = {
    steps: [
      {
        id: "mca.incorporate",
        moduleId: "mca-spice-plus",
        localId: "incorporate",
        title: "Incorporate Company",
        kind: "government",
        officeType: "company_registry",
        mode: "online",
        applicability: "applies",
        reasons: [],
        documents: [],
        sources: [],
        requirement: { kind: "mandatory" },
        fee: { kind: "free", sourceRef: "src-1" },
      } as unknown as ComposedStep,
      {
        id: "pt.ptec",
        moduleId: "mh-professional-tax",
        localId: "ptec",
        title: "PTEC Registration",
        kind: "government",
        officeType: "tax_office",
        mode: "online",
        applicability: "applies",
        reasons: [],
        documents: [],
        sources: [],
        requirement: { kind: "mandatory" },
        fee: { kind: "fixed", amountINR: 2500, recurrence: "annual", sourceRef: "src-2" },
      } as unknown as ComposedStep,
      {
        id: "pt.ptrc",
        moduleId: "mh-professional-tax",
        localId: "ptrc",
        title: "PTRC Registration",
        kind: "government",
        officeType: "tax_office",
        mode: "in_person",
        applicability: "may_apply",
        reasons: [],
        documents: [],
        sources: [],
        requirement: { kind: "conditional" },
        fee: { kind: "free", sourceRef: "src-3" },
      } as unknown as ComposedStep,
      {
        id: "fssai.reg",
        moduleId: "fssai",
        localId: "reg",
        title: "FSSAI Food Licence",
        kind: "government",
        officeType: "food_safety",
        mode: "online",
        applicability: "may_apply",
        reasons: [],
        documents: [],
        sources: [],
        requirement: { kind: "conditional" },
        fee: { kind: "range", minINR: 100, maxINR: 7500, recurrence: "annual", sourceRef: "src-4" },
      } as unknown as ComposedStep,
    ],
  };

  it("groups rows by module in template order with stable 4.1...4.N numbers", () => {
    const model = buildStageTrayModel({
      metro: mockMetro,
      stageNumber: 4,
      journey: mockJourney as ComposedJourney,
    });

    expect(model.stageNumber).toBe(4);
    expect(model.totalStations).toBe(4);
    expect(model.groups.length).toBe(3); // mca, pt, fssai

    expect(model.groups[0]?.moduleTitle).toBe("MCA SPICe+");
    expect(model.groups[0]?.items.length).toBe(1);
    expect(model.groups[0]?.items[0]?.numberLabel).toBe("4.1");
    expect(model.groups[0]?.items[0]?.feeHint).toBe("Free");

    expect(model.groups[1]?.moduleTitle).toBe("Professional Tax");
    expect(model.groups[1]?.items.length).toBe(2);
    expect(model.groups[1]?.items[0]?.numberLabel).toBe("4.2");
    expect(model.groups[1]?.items[0]?.feeHint).toBe("₹2,500");
    expect(model.groups[1]?.items[1]?.numberLabel).toBe("4.3");

    expect(model.groups[2]?.moduleTitle).toBe("FSSAI");
    expect(model.groups[2]?.items.length).toBe(1);
    expect(model.groups[2]?.items[0]?.numberLabel).toBe("4.4");
    expect(model.groups[2]?.items[0]?.feeHint).toBe("₹100–₹7,500");
  });

  it("calculates filter counts accurately and filters without altering base numbering", () => {
    const modelAll = buildStageTrayModel({
      metro: mockMetro,
      stageNumber: 4,
      journey: mockJourney as ComposedJourney,
      filter: "all",
    });

    expect(modelAll.filterCounts).toEqual({
      all: 4,
      available: 2,
      online: 3,
      in_person: 1,
      may_apply: 2,
    });

    const modelInPerson = buildStageTrayModel({
      metro: mockMetro,
      stageNumber: 4,
      journey: mockJourney as ComposedJourney,
      filter: "in_person",
    });

    // Only 1 item matches in_person: pt.ptrc
    expect(modelInPerson.groups.length).toBe(1);
    expect(modelInPerson.groups[0]?.moduleId).toBe("mh-professional-tax");
    expect(modelInPerson.groups[0]?.items.length).toBe(1);
    // Numbering remains stable: it's still 4.3!
    expect(modelInPerson.groups[0]?.items[0]?.numberLabel).toBe("4.3");
  });
});
