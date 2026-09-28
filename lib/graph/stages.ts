import type { MetroVM, StationVM } from "./viewModel";

export interface Stage {
  number: number; // 1-based (1..N)
  layer: number; // 0-based
  name: string; // e.g. "Start here", "Then", "In parallel (3)"
  label: string; // e.g. "1 · Start here", "2 · Then", "4 · In parallel (3)"
  stations: StationVM[];
  stationIds: string[];
  isDone: boolean;
  hasAvailable: boolean;
}

/**
 * Derives the list of stages from a MetroVM.
 * A stage corresponds to a layer of stations, sorted by layer ascending.
 */
export function getStages(metro: MetroVM): Stage[] {
  if (!metro || metro.stations.length === 0) {
    return [];
  }

  const layerMap = new Map<number, StationVM[]>();
  for (const s of metro.stations) {
    const list = layerMap.get(s.layer) ?? [];
    list.push(s);
    layerMap.set(s.layer, list);
  }

  const sortedLayers = Array.from(layerMap.keys()).sort((a, b) => a - b);

  return sortedLayers.map((layer) => {
    const stations = layerMap.get(layer)!;
    const stageNumber = layer + 1;
    const count = stations.length;

    let name: string;
    let label: string;
    if (layer === 0) {
      name = "Start here";
      label = "1 · Start here";
    } else if (count > 1) {
      name = `In parallel (${count})`;
      label = `${stageNumber} · In parallel (${count})`;
    } else {
      name = "Then";
      label = `${stageNumber} · Then`;
    }

    const applicableActionStations = stations.filter(
      (s) =>
        s.kind !== "milestone" &&
        (s.applicability === "applies" || s.applicability === "may_apply")
    );

    const isDone =
      applicableActionStations.length > 0
        ? applicableActionStations.every((s) => s.state === "done")
        : stations.length > 0 && stations.every((s) => s.state === "done");

    const hasAvailable = stations.some(
      (s) =>
        s.state === "available" &&
        (s.applicability === "applies" || s.applicability === "may_apply")
    );

    return {
      number: stageNumber,
      layer,
      name,
      label,
      stations,
      stationIds: stations.map((s) => s.id),
      isDone,
      hasAvailable,
    };
  });
}

/**
 * currentStage(metro): pure function per §11.1
 * Returns the lowest layer (1-based stage number) that still has an `available` step
 * whose applicability is `applies` or `may_apply` (never optional-only).
 * When every step is done, it returns the last stage.
 */
export function currentStage(metro: MetroVM): number {
  const stages = getStages(metro);
  if (stages.length === 0) {
    return 1;
  }

  for (const stage of stages) {
    if (stage.hasAvailable) {
      return stage.number;
    }
  }

  // When every step is done (or no stage has available steps that apply or may apply), return the last stage
  return stages[stages.length - 1]!.number;
}

/**
 * Returns stage number (1-based) containing the given station ID, or null if not found.
 */
export function getStageForStation(
  metro: MetroVM,
  stationId: string
): number | null {
  const station = metro.stations.find((s) => s.id === stationId);
  return station ? station.layer + 1 : null;
}
