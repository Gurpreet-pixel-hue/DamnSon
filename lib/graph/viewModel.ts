import type { ComposedJourney } from "@/lib/contract/compose";
import type { OfficeType } from "@/lib/contract/schema";
export type { OfficeType } from "@/lib/contract/schema";
import { deriveStepStates } from "./progress";
import { computeMetroLayout } from "./layout";
import { summarizeTime } from "./totals";

export type StationState = "done" | "available" | "locked";
export type Applicability = "applies" | "may_apply" | "optional";

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

export function fromJourney(
  journey: ComposedJourney,
  completed: ReadonlySet<string>
): MetroVM {
  const states = deriveStepStates(journey, completed);
  const placements = computeMetroLayout(journey);
  const timeSummary = summarizeTime(journey, completed);
  const criticalStepIds = timeSummary.criticalStepIds;

  const placementMap = new Map(placements.map((p) => [p.stepId, p]));
  const stepMap = new Map(journey.steps.map((s) => [s.id, s]));

  const stations: StationVM[] = [];

  for (const step of journey.steps) {
    const placement = placementMap.get(step.id);
    const state = states.get(step.id) ?? "locked";

    const badge =
      step.kind !== "milestone" && step.repeatCountUnknown
        ? "×?"
        : undefined;

    stations.push({
      id: step.id,
      title: step.title,
      kind: step.kind,
      officeType: step.kind === "milestone" ? null : step.officeType,
      mode: step.kind === "milestone" ? null : step.mode,
      state,
      applicability: step.applicability,
      layer: placement?.layer ?? 0,
      lane: placement?.lane ?? 0,
      position3D: placement?.position3D ?? [0, 0, 0],
      position2D: placement?.position2D ?? { x: 0, y: 0 },
      ...(badge ? { badge } : {}),
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
  for (const edge of journey.edges) {
    const fromStep = stepMap.get(edge.from);
    const toStep = stepMap.get(edge.to);

    const fromApplicability = fromStep?.applicability ?? "applies";
    const toApplicability = toStep?.applicability ?? "applies";

    const dashed =
      edge.kind === "recommended_after" ||
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
      kind: edge.kind,
      critical: isCritical,
      toAvailable,
      dashed,
    });
  }

  return { stations, tracks };
}
