import type { ComposedJourney, ComposedStep } from "@/lib/contract/compose";
import type { MetroVM, StationVM } from "./viewModel";
import { formatINR } from "./summary";

export type TrayFilter = "all" | "available" | "online" | "in_person" | "may_apply";

export interface TrayItem {
  station: StationVM;
  numberLabel: string; // e.g. "4.1"
  indexInStage: number; // 1-based (1..N)
  moduleId: string;
  moduleTitle: string;
  mode: "online" | "in_person" | "hybrid" | null;
  feeHint: string;
  isAvailable: boolean;
  isDone: boolean;
  isMayApply: boolean;
  conditionText?: string;
}

export interface TrayGroup {
  moduleId: string;
  moduleTitle: string;
  items: TrayItem[];
  subHeader?: string;
}

export interface FilterCounts {
  all: number;
  available: number;
  online: number;
  in_person: number;
  may_apply: number;
}

export interface StageTrayModel {
  stageNumber: number;
  stageName: string;
  title: string; // e.g. "Stage 4 · 15 things you can do in parallel"
  totalStations: number;
  groups: TrayGroup[];
  allOrderedItems: TrayItem[];
  filterCounts: FilterCounts;
  activeFilter: TrayFilter;
}

export function getModuleTitle(moduleId: string, moduleTitles?: Record<string, string>): string {
  if (moduleTitles && moduleTitles[moduleId]) {
    return moduleTitles[moduleId]!;
  }
  // Fallback: title-case the slug
  return moduleId
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Derives the fee hint text for a station (§12.3, A5 & PRD §8.8 honest-tile rules).
 */
export function deriveFeeHint(station: StationVM, step?: ComposedStep): string {
  if (station.kind === "milestone") return "Free";
  if (!step || step.kind === "milestone") return "Fee: not verified";

  const fee = step.fee;
  if (!fee) return "Fee: not verified";

  switch (fee.kind) {
    case "free":
      return "Free";
    case "fixed":
      return fee.recurrence === "annual"
        ? `${formatINR(fee.amountINR)} / year`
        : formatINR(fee.amountINR);
    case "range":
      return fee.recurrence === "annual"
        ? `${formatINR(fee.minINR)}–${formatINR(fee.maxINR)} / year`
        : `${formatINR(fee.minINR)}–${formatINR(fee.maxINR)}`;
    case "variable":
      return fee.note ? `Variable: ${fee.note}` : "Variable";
    case "unknown":
    default:
      return "Fee: not verified";
  }
}

/**
 * Extracts moduleId from station ID (e.g. "mh-professional-tax.ptec" -> "mh-professional-tax").
 */
export function extractModuleId(stationId: string): string {
  const parts = stationId.split(".");
  return parts[0] || stationId;
}

export interface BuildStageTrayOptions {
  metro: MetroVM;
  stageNumber: number; // 1-based
  journey?: ComposedJourney | null;
  moduleTitles?: Record<string, string>;
  filter?: TrayFilter;
}

/**
 * Builds the pure StageTrayModel for a given stage (§12.3).
 */
export function buildStageTrayModel(options: BuildStageTrayOptions): StageTrayModel {
  const { metro, stageNumber, journey, moduleTitles, filter = "all" } = options;
  const targetLayer = stageNumber - 1;

  // Find all stations in this stage
  const stageStations = metro.stations.filter((s) => s.layer === targetLayer);

  // Determine template module order
  const moduleOrder: string[] = [];
  const stepMap = new Map<string, ComposedStep>();

  if (journey) {
    for (const step of journey.steps) {
      stepMap.set(step.id, step);
      if (!moduleOrder.includes(step.moduleId)) {
        moduleOrder.push(step.moduleId);
      }
    }
  }

  // If no journey or module order, sort by station lane
  const getStepModuleId = (station: StationVM): string => {
    const step = stepMap.get(station.id);
    return step ? step.moduleId : extractModuleId(station.id);
  };

  // Group stations by module
  const stationsByModule = new Map<string, StationVM[]>();
  for (const station of stageStations) {
    const modId = getStepModuleId(station);
    const list = stationsByModule.get(modId) ?? [];
    list.push(station);
    stationsByModule.set(modId, list);
  }

  // Sort modules by template order, then any leftover modules alphabetically
  const sortedModuleIds = Array.from(stationsByModule.keys()).sort((a, b) => {
    const idxA = moduleOrder.indexOf(a);
    const idxB = moduleOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  // Within each module, sort stations by lane (layout order) or by appearance in journey.steps
  for (const modId of sortedModuleIds) {
    const list = stationsByModule.get(modId)!;
    list.sort((a, b) => {
      if (journey) {
        const idxA = journey.steps.findIndex((s) => s.id === a.id);
        const idxB = journey.steps.findIndex((s) => s.id === b.id);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      }
      return a.lane - b.lane;
    });
  }

  // Flatten into allOrderedItems and assign 1-based indices (4.1..4.15)
  const allOrderedItems: TrayItem[] = [];
  let currentIndex = 1;

  for (const modId of sortedModuleIds) {
    const list = stationsByModule.get(modId)!;
    const modTitle = getModuleTitle(modId, moduleTitles);

    for (const station of list) {
      const step = stepMap.get(station.id);
      let conditionText: string | undefined;
      if (step && step.kind !== "milestone" && step.requirement.kind === "conditional") {
        conditionText = `Applies if: ${step.requirement.condition}`;
      }

      const item: TrayItem = {
        station,
        numberLabel: `${stageNumber}.${currentIndex}`,
        indexInStage: currentIndex,
        moduleId: modId,
        moduleTitle: modTitle,
        mode: station.mode,
        feeHint: deriveFeeHint(station, step),
        isAvailable: station.state === "available",
        isDone: station.state === "done",
        isMayApply: station.applicability === "may_apply",
        conditionText,
      };
      allOrderedItems.push(item);
      currentIndex++;
    }
  }

  // Compute filter counts over all stations in the stage
  const filterCounts: FilterCounts = {
    all: allOrderedItems.length,
    available: allOrderedItems.filter((i) => i.isAvailable).length,
    online: allOrderedItems.filter((i) => i.mode === "online").length,
    in_person: allOrderedItems.filter((i) => i.mode === "in_person").length,
    may_apply: allOrderedItems.filter((i) => i.isMayApply).length,
  };

  // Filter items based on activeFilter
  const matchesFilter = (item: TrayItem): boolean => {
    switch (filter) {
      case "available":
        return item.isAvailable;
      case "online":
        return item.mode === "online";
      case "in_person":
        return item.mode === "in_person";
      case "may_apply":
        return item.isMayApply;
      case "all":
      default:
        return true;
    }
  };

  const filteredItems = allOrderedItems.filter(matchesFilter);

  // Group filtered items into TrayGroups
  const groupMap = new Map<string, TrayItem[]>();
  for (const item of filteredItems) {
    const list = groupMap.get(item.moduleId) ?? [];
    list.push(item);
    groupMap.set(item.moduleId, list);
  }

  const groups: TrayGroup[] = [];
  for (const modId of sortedModuleIds) {
    const items = groupMap.get(modId);
    if (items && items.length > 0) {
      const allMayApply = items.length > 1 && items.every((i) => i.isMayApply);
      groups.push({
        moduleId: modId,
        moduleTitle: getModuleTitle(modId, moduleTitles),
        items,
        subHeader: allMayApply ? "One of these, depending on your situation" : undefined,
      });
    }
  }

  const stageName =
    targetLayer === 0
      ? "Start here"
      : allOrderedItems.length > 1
      ? "In parallel"
      : "Then";

  const title =
    allOrderedItems.length > 1
      ? `Stage ${stageNumber} · ${allOrderedItems.length} things you can do in parallel`
      : `Stage ${stageNumber} · ${stageName}`;

  return {
    stageNumber,
    stageName,
    title,
    totalStations: allOrderedItems.length,
    groups,
    allOrderedItems,
    filterCounts,
    activeFilter: filter,
  };
}
