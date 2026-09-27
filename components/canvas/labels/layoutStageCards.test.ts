import { describe, it, expect } from "vitest";
import {
  layoutStageCards,
  type StageStationInput,
  type LayoutStageCardsInput,
} from "./layoutStageCards";

describe("layoutStageCards (§11.4, §11.7)", () => {
  const sampleStations: StageStationInput[] = [
    {
      id: "step-1",
      title: "First Step",
      anchorX: 300,
      anchorY: 400,
      state: "available",
      applicability: "applies",
    },
    {
      id: "step-2",
      title: "Second Step",
      anchorX: 450,
      anchorY: 410,
      state: "locked",
      applicability: "applies",
    },
    {
      id: "step-3",
      title: "Third Step",
      anchorX: 600,
      anchorY: 390,
      state: "locked",
      applicability: "applies",
    },
  ];

  const defaultViewport = { width: 1440, height: 900 };

  it("the same input gives the same output (deterministic)", () => {
    const input: LayoutStageCardsInput = {
      stations: sampleStations,
      viewport: defaultViewport,
    };

    const run1 = layoutStageCards(input);
    const run2 = layoutStageCards(input);

    expect(run1.size).toBe(run2.size);
    for (const [id, card1] of run1) {
      const card2 = run2.get(id);
      expect(card2).toBeDefined();
      expect(card1.xOff).toBe(card2!.xOff);
      expect(card1.yOff).toBe(card2!.yOff);
      expect(card1.cardRect).toEqual(card2!.cardRect);
    }
  });

  it("only focused-stage stations get cards", () => {
    // If a stage has 2 stations, only those 2 get cards
    const stageStations = sampleStations.slice(0, 2);
    const result = layoutStageCards({
      stations: stageStations,
      viewport: defaultViewport,
    });

    expect(result.size).toBe(2);
    expect(result.has("step-1")).toBe(true);
    expect(result.has("step-2")).toBe(true);
    expect(result.has("step-3")).toBe(false);
  });

  it("changes to hover, selection or done state do not change any offset", () => {
    const baseInput: LayoutStageCardsInput = {
      stations: [
        {
          id: "step-a",
          title: "Step A",
          anchorX: 350,
          anchorY: 400,
          state: "available",
          applicability: "applies",
        },
        {
          id: "step-b",
          title: "Step B",
          anchorX: 500,
          anchorY: 420,
          state: "locked",
          applicability: "applies",
        },
      ],
      viewport: defaultViewport,
    };

    const initialLayout = layoutStageCards(baseInput);

    // Simulate marking step-a done
    const doneInput: LayoutStageCardsInput = {
      stations: [
        {
          id: "step-a",
          title: "Step A",
          anchorX: 350,
          anchorY: 400,
          state: "done", // changed to done
          applicability: "applies",
        },
        {
          id: "step-b",
          title: "Step B",
          anchorX: 500,
          anchorY: 420,
          state: "available", // became available
          applicability: "applies",
        },
      ],
      viewport: defaultViewport,
    };

    const afterDoneLayout = layoutStageCards(doneInput);

    for (const [id, initialCard] of initialLayout) {
      const afterCard = afterDoneLayout.get(id);
      expect(afterCard).toBeDefined();
      expect(initialCard.xOff).toBe(afterCard!.xOff);
      expect(initialCard.yOff).toBe(afterCard!.yOff);
    }
  });

  it("resolves vertical overlap by placing second card below anchor or pushing sideways", () => {
    const overlappingStations: StageStationInput[] = [
      {
        id: "overlap-1",
        title: "Station 1",
        anchorX: 400,
        anchorY: 400,
        state: "available",
      },
      {
        id: "overlap-2",
        title: "Station 2",
        anchorX: 420, // very close x
        anchorY: 405, // very close y
        state: "available",
      },
    ];

    const result = layoutStageCards({
      stations: overlappingStations,
      viewport: defaultViewport,
    });

    const c1 = result.get("overlap-1")!;
    const c2 = result.get("overlap-2")!;

    expect(c1).toBeDefined();
    expect(c2).toBeDefined();
    // One card is at -56, the other either flips to +56 or pushes sideways
    expect(c1.yOff !== c2.yOff || c1.xOff !== c2.xOff).toBe(true);
  });

  it("switches to compact mode when more than 4 stations are in the stage", () => {
    const fiveStations: StageStationInput[] = Array.from({ length: 5 }, (_, i) => ({
      id: `parallel-${i}`,
      title: `Parallel Step ${i + 1}`,
      anchorX: 200 + i * 150,
      anchorY: 400,
      state: "available" as const,
    }));

    const result = layoutStageCards({
      stations: fiveStations,
      viewport: defaultViewport,
    });

    expect(result.size).toBe(5);
    for (const card of result.values()) {
      expect(card.isCompact).toBe(true);
      expect(card.width).toBe(180);
    }
  });
});
