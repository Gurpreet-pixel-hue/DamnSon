import type { ComposedJourney, ComposedStep } from "@/lib/contract/compose";
import { analyzeJourney } from "@/lib/contract/analyze";

export const LAYOUT = {
  layerSpacing3D: 7,
  laneSpacing3D: 4.5,
  onlineHeight: 2.2,
  layerSpacing2D: 280,
  laneSpacing2D: 140,
} as const;

export interface Placement {
  stepId: string;
  layer: number;
  lane: number;
  position3D: [number, number, number];
  position2D: { x: number; y: number };
}

export function computeMetroLayout(journey: ComposedJourney): Placement[] {
  if (journey.steps.length === 0) {
    return [];
  }

  const analysis = analyzeJourney(journey);
  const layers = analysis.ok ? analysis.layers : [journey.steps.map((s) => s.id)];

  const stepMap = new Map<string, ComposedStep>(
    journey.steps.map((s) => [s.id, s])
  );
  const stepOrderMap = new Map<string, number>(
    journey.steps.map((s, idx) => [s.id, idx])
  );

  // Incoming edges per step (over all edges)
  const incomingEdgesMap = new Map<string, string[]>();
  for (const step of journey.steps) {
    incomingEdgesMap.set(step.id, []);
  }
  for (const edge of journey.edges) {
    incomingEdgesMap.get(edge.to)?.push(edge.from);
  }

  const offsetMap = new Map<string, number>();
  const placements: Placement[] = [];

  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layerStepIds = layers[layerIdx] ?? [];
    if (layerStepIds.length === 0) continue;

    // Compute barycenter for each step in this layer
    const stepsWithBarycenter = layerStepIds.map((stepId) => {
      const prereqs = incomingEdgesMap.get(stepId) ?? [];
      let barycenter = 0;
      if (prereqs.length > 0) {
        let sum = 0;
        let count = 0;
        for (const p of prereqs) {
          const pOffset = offsetMap.get(p);
          if (pOffset !== undefined) {
            sum += pOffset;
            count++;
          }
        }
        barycenter = count > 0 ? sum / count : 0;
      }
      return {
        stepId,
        barycenter,
        nodeIndex: stepOrderMap.get(stepId) ?? 0,
      };
    });

    // Sort by barycenter; ties go to step definition order
    stepsWithBarycenter.sort((a, b) => {
      if (a.barycenter !== b.barycenter) {
        return a.barycenter - b.barycenter;
      }
      return a.nodeIndex - b.nodeIndex;
    });

    const n = stepsWithBarycenter.length;
    for (let i = 0; i < n; i++) {
      const item = stepsWithBarycenter[i];
      if (!item) continue;
      const { stepId } = item;
      const offset = i - (n - 1) / 2;
      offsetMap.set(stepId, offset);

      const step = stepMap.get(stepId);
      const isOnline = step && step.kind !== "milestone" && step.mode === "online";
      const y3D = isOnline ? LAYOUT.onlineHeight : 0;

      const position3D: [number, number, number] = [
        layerIdx * LAYOUT.layerSpacing3D,
        y3D,
        offset * LAYOUT.laneSpacing3D,
      ];

      const position2D = {
        x: layerIdx * LAYOUT.layerSpacing2D,
        y: offset * LAYOUT.laneSpacing2D,
      };

      placements.push({
        stepId,
        layer: layerIdx,
        lane: offset,
        position3D,
        position2D,
      });
    }
  }

  return placements;
}
