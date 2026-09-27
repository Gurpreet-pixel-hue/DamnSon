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

  it("shows all stations when count <= 16", () => {
    const stations = Array.from({ length: 12 }, (_, i) =>
      makeDummyStation(`s${i + 1}`, i < 2 ? "done" : i < 6 ? "available" : "locked")
    );
    const metro = makeDummyMetro(stations);

    const labels = selectLabels(metro, null, null);
    expect(labels).toHaveLength(12);
  });

  it("prioritizes next-up, hovered, focused, selected and last done when count > 16", () => {
    const stations = Array.from({ length: 20 }, (_, i) =>
      makeDummyStation(`s${i + 1}`, i === 0 ? "done" : i < 4 ? "available" : "locked")
    );
    const metro = makeDummyMetro(stations);

    // Hover s10, focus s12, select s15
    const labels = selectLabels(metro, "s10", "s12", "s15");
    const ids = labels.map((s) => s.id);
    expect(ids[0]).toBe("s10"); // hovered
    expect(ids[1]).toBe("s12"); // focused
    expect(ids[2]).toBe("s15"); // selected
    expect(ids).toContain("s2"); // next-up available
    expect(ids).toContain("s3"); // next-up available
    expect(ids).toContain("s4"); // next-up available
    expect(ids).toContain("s1"); // last done
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

  it("skips optional stations from next-up priority when count > 16", () => {
    const stations = Array.from({ length: 18 }, (_, i) =>
      makeDummyStation(
        `s${i + 1}`,
        i < 3 ? "available" : "locked",
        i === 0 ? "optional" : "applies"
      )
    );
    const metro = makeDummyMetro(stations);

    const labels = selectLabels(metro, null, null);
    const ids = labels.map((s) => s.id);
    // s1 is optional available, s2 and s3 are non-optional available
    expect(ids).toContain("s2");
    expect(ids).toContain("s3");
    expect(ids.indexOf("s2")).toBeLessThan(ids.indexOf("s1") === -1 ? 999 : ids.indexOf("s1"));
  });

  it("ignores non-existent station IDs gracefully", () => {
    const stations = [makeDummyStation("s1", "available")];
    const metro = makeDummyMetro(stations);

    const labels = selectLabels(metro, "ghost-hover", "ghost-focus");
    expect(labels.map((s) => s.id)).toEqual(["s1"]);
  });
});
