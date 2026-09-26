import { describe, it, expect } from "vitest";
import { selectLabels, MAX_LABEL_SLOTS } from "./selectLabels";
import type { MetroVM, StationVM } from "@/lib/graph/viewModel";

function makeDummyStation(
  id: string,
  state: StationVM["state"] = "available",
  applicability: StationVM["applicability"] = "applies"
): StationVM {
  return {
    id,
    title: `Station ${id}`,
    kind: "government",
    officeType: "municipal_hq",
    mode: "in_person",
    state,
    applicability,
    layer: 0,
    lane: 0,
    position3D: [0, 0, 0],
    position2D: { x: 0, y: 0 },
  };
}

function makeDummyMetro(stations: StationVM[]): MetroVM {
  return {
    stations,
    tracks: [],
  };
}

describe("selectLabels", () => {
  it("prioritizes hovered first, then focused, then next-up available mandatory stations", () => {
    const stations = [
      makeDummyStation("s1", "locked"),
      makeDummyStation("s2", "available"),
      makeDummyStation("s3", "available"),
      makeDummyStation("s4", "available"),
      makeDummyStation("s5", "locked"),
    ];
    const metro = makeDummyMetro(stations);

    const labels = selectLabels(metro, "s5", "s1");
    // s5 (hovered), s1 (focused), then s2, s3, s4 (available next-up)
    expect(labels.map((s) => s.id)).toEqual(["s5", "s1", "s2", "s3", "s4"]);
  });

  it("strictly caps the selection at MAX_LABEL_SLOTS (6)", () => {
    const stations = [
      makeDummyStation("s1", "available"),
      makeDummyStation("s2", "available"),
      makeDummyStation("s3", "available"),
      makeDummyStation("s4", "available"),
      makeDummyStation("s5", "available"),
      makeDummyStation("s6", "available"),
      makeDummyStation("s7", "available"),
      makeDummyStation("s8", "available"),
    ];
    const metro = makeDummyMetro(stations);

    const labels = selectLabels(metro, null, null);
    expect(labels).toHaveLength(MAX_LABEL_SLOTS);
    expect(labels.map((s) => s.id)).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
      "s5",
      "s6",
    ]);
  });

  it("removes duplicates when hovered equals focused or matches an available next-up station", () => {
    const stations = [
      makeDummyStation("s1", "available"),
      makeDummyStation("s2", "available"),
      makeDummyStation("s3", "available"),
    ];
    const metro = makeDummyMetro(stations);

    // s2 is hovered and focused
    const labels = selectLabels(metro, "s2", "s2");
    expect(labels.map((s) => s.id)).toEqual(["s2", "s1", "s3"]);
    expect(new Set(labels.map((s) => s.id)).size).toBe(labels.length);
  });

  it("skips optional stations from next-up priority", () => {
    const stations = [
      makeDummyStation("s1", "available", "optional"),
      makeDummyStation("s2", "available", "applies"),
      makeDummyStation("s3", "available", "may_apply"),
    ];
    const metro = makeDummyMetro(stations);

    const labels = selectLabels(metro, null, null);
    // s1 is optional, so only s2 and s3 qualify as next-up
    expect(labels.map((s) => s.id)).toEqual(["s2", "s3"]);
  });

  it("ignores non-existent station IDs gracefully", () => {
    const stations = [makeDummyStation("s1", "available")];
    const metro = makeDummyMetro(stations);

    const labels = selectLabels(metro, "ghost-hover", "ghost-focus");
    expect(labels.map((s) => s.id)).toEqual(["s1"]);
  });
});
