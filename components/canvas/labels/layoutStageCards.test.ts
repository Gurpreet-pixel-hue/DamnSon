import { describe, it, expect } from "vitest";
import {
  layoutStageCards,
  computeOverlapArea,
  type StageStationInput,
  type LayoutStageCardsInput,
} from "./layoutStageCards";

describe("layoutStageCards (§11.4, §11.7, §11.8)", () => {
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

    const doneInput: LayoutStageCardsInput = {
      stations: [
        {
          id: "step-a",
          title: "Step A",
          anchorX: 350,
          anchorY: 400,
          state: "done",
          applicability: "applies",
        },
        {
          id: "step-b",
          title: "Step B",
          anchorX: 500,
          anchorY: 420,
          state: "available",
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

  it("avoids card-card and card-obstacle overlap with 0 px^2 overlap area (§11.8)", () => {
    const closeStations: StageStationInput[] = [
      {
        id: "c-1",
        title: "Station 1",
        anchorX: 400,
        anchorY: 400,
        state: "available",
      },
      {
        id: "c-2",
        title: "Station 2",
        anchorX: 430,
        anchorY: 410,
        state: "available",
      },
      {
        id: "c-3",
        title: "Station 3",
        anchorX: 470,
        anchorY: 395,
        state: "available",
      },
    ];

    const chipObstacle = { minX: 380, maxX: 500, minY: 320, maxY: 352 };

    const result = layoutStageCards({
      stations: closeStations,
      viewport: defaultViewport,
      obstacles: [chipObstacle],
    });

    const cards = Array.from(result.values());
    expect(cards.length).toBe(3);

    // Assert 0 px² overlap between any two cards
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const overlap = computeOverlapArea(cards[i]!.cardRect, cards[j]!.cardRect);
        expect(overlap).toBe(0);
      }
    }

    // Assert 0 px² overlap with chip obstacle
    for (const card of cards) {
      const overlap = computeOverlapArea(card.cardRect, chipObstacle);
      expect(overlap).toBe(0);
    }
  });

  it("enforces maximum tether length <= 140 px (§11.8)", () => {
    const stations: StageStationInput[] = [
      { id: "t-1", title: "Station 1", anchorX: 300, anchorY: 300 },
      { id: "t-2", title: "Station 2", anchorX: 330, anchorY: 320 },
      { id: "t-3", title: "Station 3", anchorX: 360, anchorY: 310 },
      { id: "t-4", title: "Station 4", anchorX: 390, anchorY: 305 },
    ];

    const result = layoutStageCards({
      stations,
      viewport: defaultViewport,
    });

    for (const card of result.values()) {
      expect(card.tetherLength).toBeLessThanOrEqual(140);
    }
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

  it("handles drawer obstacle and pushes cards away from drawer area (§11.8)", () => {
    const rightStation: StageStationInput = {
      id: "drawer-side",
      title: "Right Station",
      anchorX: 1100,
      anchorY: 400,
      state: "available",
    };

    const closed = layoutStageCards({
      stations: [rightStation],
      viewport: defaultViewport,
      drawerOpen: false,
    });
    expect(closed.get("drawer-side")).toBeDefined();

    const open = layoutStageCards({
      stations: [rightStation],
      viewport: defaultViewport,
      drawerOpen: true,
    });

    const cardOpen = open.get("drawer-side")!;
    expect(cardOpen).toBeDefined();
    // Drawer occupies [1440 - 380, 1440] = [1060, 1440]
    expect(cardOpen.cardRect.maxX).toBeLessThanOrEqual(1440 - 380);
  });
});
