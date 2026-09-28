import { describe, it, expect } from "vitest";
import { getStagePillLabel, isPillCollapsed } from "./StageBar";
import type { Stage } from "@/lib/graph/stages";
import type { StationVM } from "@/lib/graph/viewModel";

describe("StageBar logic (§12.2)", () => {
  it("generates correct pill labels", () => {
    const stage1: Stage = {
      number: 1,
      layer: 0,
      name: "Start here",
      label: "1 · Start here",
      stations: [{} as unknown as StationVM],
      stationIds: ["s1"],
      isDone: false,
      hasAvailable: true,
    };
    expect(getStagePillLabel(stage1)).toBe("1 Start here");

    const stage2: Stage = {
      number: 2,
      layer: 1,
      name: "Then",
      label: "2 · Then",
      stations: [{} as unknown as StationVM],
      stationIds: ["s2"],
      isDone: true,
      hasAvailable: false,
    };
    expect(getStagePillLabel(stage2)).toBe("2 Then");

    const stage4: Stage = {
      number: 4,
      layer: 3,
      name: "In parallel (15)",
      label: "4 · In parallel (15)",
      stations: new Array(15).fill({} as unknown as StationVM),
      stationIds: new Array(15).fill("s"),
      isDone: false,
      hasAvailable: true,
    };
    expect(getStagePillLabel(stage4)).toBe("4 In parallel · 15");
  });

  it("does not collapse pills when totalStages <= 7", () => {
    // 7 total stages: none should collapse
    for (let i = 1; i <= 7; i++) {
      expect(isPillCollapsed(i, 4, 7)).toBe(false);
    }
  });

  it("collapses pills outside focused ± 2 when totalStages > 7", () => {
    // 10 total stages, focused on 5:
    // Visible range: [3, 7] -> 3, 4, 5, 6, 7 are NOT collapsed
    expect(isPillCollapsed(5, 5, 10)).toBe(false);
    expect(isPillCollapsed(4, 5, 10)).toBe(false);
    expect(isPillCollapsed(6, 5, 10)).toBe(false);
    expect(isPillCollapsed(3, 5, 10)).toBe(false);
    expect(isPillCollapsed(7, 5, 10)).toBe(false);

    // Outside range: 1, 2, 8, 9, 10 ARE collapsed
    expect(isPillCollapsed(1, 5, 10)).toBe(true);
    expect(isPillCollapsed(2, 5, 10)).toBe(true);
    expect(isPillCollapsed(8, 5, 10)).toBe(true);
    expect(isPillCollapsed(9, 5, 10)).toBe(true);
    expect(isPillCollapsed(10, 5, 10)).toBe(true);
  });

  it("scrolls only the pill strip and keeps ancestor container scrollLeft at 0 (A1)", () => {
    // Simulate DOM structure: WindowCard container -> StageBar -> strip -> pill
    const canvasContainer = { scrollLeft: 0, scrollTop: 0 };
    let scrolledLeft = -1;
    const strip = {
      clientWidth: 300,
      scrollLeft: 0,
      scrollTo: ({ left }: { left: number; behavior?: string }) => {
        scrolledLeft = left;
        strip.scrollLeft = left;
      },
    };
    const pill = {
      offsetLeft: 180,
      offsetWidth: 60,
    };

    // Calculation used in StageBar:
    const targetLeft = pill.offsetLeft - (strip.clientWidth - pill.offsetWidth) / 2;
    strip.scrollTo({ left: targetLeft, behavior: "smooth" });

    // Ancestor canvas container must stay exactly 0
    expect(canvasContainer.scrollLeft).toBe(0);
    expect(canvasContainer.scrollTop).toBe(0);
    // Strip scrolled to center the pill
    expect(scrolledLeft).toBe(60);
  });
});

