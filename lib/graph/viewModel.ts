import type { ResolvedPath } from "./resolvePath";
import { deriveStepStates } from "./progress";
import { computeMetroLayout } from "./layout";
import { summarizeTime } from "./totals";

export type StationState = "done" | "available" | "locked";
export type Applicability = "applies" | "may_apply" | "optional";

export type OfficeType =
  | "municipal_hq"
  | "ward_office"
  | "fire_services"
  | "health_department"
  | "revenue_office"
  | "labour_department"
  | "police"
  | "pollution_control_board"
  | "utility_provider"
  | "court_or_notary"
  | "other"
  | "online_portal";

export interface StationVM {
  id: string;
  title: string;
  kind: "government" | "non_government" | "milestone";
  officeType: OfficeType | null; // null for milestones
  mode: "online" | "in_person" | "hybrid" | null; // null for milestones
  state: StationState;
  applicability: Applicability;
  layer: number;
  lane: number;
  position3D: [number, number, number];
  position2D: { x: number; y: number };
  badge?: string; // "×?" when a repeat count is unknown
}

export interface TrackVM {
  id: string;
  from: string;
  to: string;
  kind: "requires" | "recommended_after";
  critical: boolean;
  toAvailable: boolean;
  dashed: boolean;
}

export interface MetroVM {
  stations: StationVM[];
  tracks: TrackVM[];
}

export function fromV2(
  resolved: ResolvedPath,
  completed: ReadonlySet<string>
): MetroVM {
  const { graph, undecidedStepIds } = resolved;
  const states = deriveStepStates(graph, completed);
  const placements = computeMetroLayout(resolved);
  const timeSummary = summarizeTime(resolved, completed);
  const criticalStepIds = timeSummary.criticalStepIds;

  const placementMap = new Map(placements.map((p) => [p.stepId, p]));
  const undecidedSet = new Set(undecidedStepIds);

  const stations: StationVM[] = [];
  const stationApplicabilityMap = new Map<string, Applicability>();

  for (const node of graph.nodes) {
    const placement = placementMap.get(node.id);
    let applicability: Applicability = "applies";
    if (undecidedSet.has(node.id)) {
      applicability = "may_apply";
    } else if (node.requirement.kind === "optional") {
      applicability = "optional";
    }

    stationApplicabilityMap.set(node.id, applicability);

    const state = states.get(node.id) ?? "locked";

    stations.push({
      id: node.id,
      title: node.title,
      kind: "government",
      officeType: node.officeType,
      mode: node.mode,
      state,
      applicability,
      layer: placement?.layer ?? 0,
      lane: placement?.lane ?? 0,
      position3D: placement?.position3D ?? [0, 0, 0],
      position2D: placement?.position2D ?? { x: 0, y: 0 },
    });
  }

  // Pre-index consecutive critical step pairs for O(1) lookup
  const criticalPairs = new Set<string>();
  for (let i = 0; i < criticalStepIds.length - 1; i++) {
    const fromId = criticalStepIds[i];
    const toId = criticalStepIds[i + 1];
    if (fromId && toId) {
      criticalPairs.add(`${fromId}->${toId}`);
    }
  }

  const tracks: TrackVM[] = [];
  for (const edge of graph.edges) {
    const fromApplicability = stationApplicabilityMap.get(edge.from) ?? "applies";
    const toApplicability = stationApplicabilityMap.get(edge.to) ?? "applies";
    const dashed =
      fromApplicability === "may_apply" ||
      fromApplicability === "optional" ||
      toApplicability === "may_apply" ||
      toApplicability === "optional";

    const isCritical = criticalPairs.has(`${edge.from}->${edge.to}`);
    const toState = states.get(edge.to);
    const toAvailable = toState === "available";

    tracks.push({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      kind: "requires",
      critical: isCritical,
      toAvailable,
      dashed,
    });
  }

  return { stations, tracks };
}
