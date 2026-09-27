import { describe, it, expect } from "vitest";
import { buildFlow2DGraph } from "./flow2d";
import { fromJourney, type MetroVM } from "./viewModel";
import { readTemplateFixture, readModuleFixture } from "@/data/fixtures/v3/loadFixture";
import { journeyTemplateSchema, approvalModuleSchema } from "@/lib/contract/schema";
import { composeJourney } from "@/lib/contract/compose";
import { PALETTE } from "@/components/canvas/palette";

function loadTestMetro(): MetroVM {
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
  return fromJourney(journey, new Set());
}

describe("flow2d", () => {
  it("builds non-draggable nodes with positions matching position2D directly", () => {
    const metro = loadTestMetro();
    const { nodes } = buildFlow2DGraph(metro, {
      focusStage: 1,
      selectedStepId: null,
      hoveredStepId: null,
      criticalPathOn: false,
    });

    expect(nodes.length).toBe(metro.stations.length);

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      const station = metro.stations[i]!;
      expect(node.id).toBe(station.id);
      expect(node.draggable).toBe(false);
      expect(node.position.x).toBe(station.position2D.x);
      expect(node.position.y).toBe(station.position2D.y);
    }
  });

  it("highlights focused stage and dims other stages", () => {
    const metro = loadTestMetro();
    const { nodes } = buildFlow2DGraph(metro, {
      focusStage: 1,
      selectedStepId: null,
      hoveredStepId: null,
      criticalPathOn: false,
    });

    const stage1Nodes = nodes.filter((n) => n.data.station.layer === 0);
    const otherNodes = nodes.filter((n) => n.data.station.layer !== 0);

    for (const n of stage1Nodes) {
      expect(n.data.isFocusedStage).toBe(true);
    }
    for (const n of otherNodes) {
      expect(n.data.isFocusedStage).toBe(false);
    }
  });

  it("applies 3px critical path stroke width when criticalPathOn is enabled", () => {
    const metro = loadTestMetro();
    const { edges } = buildFlow2DGraph(metro, {
      focusStage: 1,
      selectedStepId: null,
      hoveredStepId: null,
      criticalPathOn: true,
    });

    const criticalEdge = edges.find((e) => e.style?.stroke === PALETTE.critical);
    if (criticalEdge) {
      expect(criticalEdge.style?.strokeWidth).toBe(3); // Amendment 3
    }
  });

  it("formats StationNode aria-label exactly as 'Step X of Y, Title, State, Z prerequisites done'", () => {
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

    // Initial state: first step is available with 0 prerequisites done
    const metro0 = fromJourney(journey, new Set());
    const { nodes: nodes0 } = buildFlow2DGraph(metro0, {
      focusStage: 1,
      selectedStepId: null,
      hoveredStepId: null,
      criticalPathOn: false,
    });

    const firstNode = nodes0[0]!;
    expect(firstNode.ariaLabel).toBe(
      `Step 1 of ${metro0.stations.length}, ${firstNode.data.station.title}, available, 0 prerequisites done`
    );
    expect(firstNode.data.ariaLabel).toBe(firstNode.ariaLabel);

    // Complete first step and verify dependent station reflects prerequisites done count
    const completedSet = new Set(["ex-directors.kyc.1"]);
    const metro1 = fromJourney(journey, completedSet);
    const { nodes: nodes1 } = buildFlow2DGraph(metro1, {
      focusStage: 1,
      selectedStepId: null,
      hoveredStepId: null,
      criticalPathOn: false,
    });

    for (let i = 0; i < nodes1.length; i++) {
      const node = nodes1[i]!;
      const station = metro1.stations[i]!;
      expect(node.ariaLabel).toMatch(
        new RegExp(
          `^Step ${i + 1} of ${metro1.stations.length}, .+, (done|available|locked), \\d+ prerequisites done$`
        )
      );
      expect(node.ariaLabel).toContain(station.title);
      expect(node.ariaLabel).toContain(station.state);
    }
  });
});
