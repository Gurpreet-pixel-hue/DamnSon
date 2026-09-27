import type { Step } from "./schema";
import type { ResolvedPath } from "./resolvePath";
import { analyzeGraph } from "./analyzeGraph";

export interface OfficeTrip {
  key: string;
  name: string;
  officeType: Step["officeType"];
  lat?: number;
  lng?: number;
  stepIds: string[];
}

export function planOfficeTrips(path: ResolvedPath): OfficeTrip[] {
  const analysis = analyzeGraph(path.graph);
  const nodeMap = new Map<string, Step>(
    path.graph.nodes.map((n) => [n.id, n])
  );

  const trips: OfficeTrip[] = [];
  const tripMap = new Map<string, OfficeTrip>();

  for (const stepId of analysis.order) {
    const node = nodeMap.get(stepId);
    if (!node) continue;

    // Include steps whose mode isn't online and which aren't optional
    if (node.mode === "online" || node.requirement.kind === "optional") {
      continue;
    }

    const name = node.office?.name ?? node.department;
    const key = name.toLowerCase();

    const existingTrip = tripMap.get(key);
    if (existingTrip) {
      existingTrip.stepIds.push(node.id);
      if (
        existingTrip.lat === undefined &&
        node.office?.lat !== undefined &&
        node.office?.lng !== undefined
      ) {
        existingTrip.lat = node.office.lat;
        existingTrip.lng = node.office.lng;
      }
    } else {
      const trip: OfficeTrip = {
        key,
        name,
        officeType: node.officeType,
        stepIds: [node.id],
      };
      if (
        node.office?.lat !== undefined &&
        node.office?.lng !== undefined
      ) {
        trip.lat = node.office.lat;
        trip.lng = node.office.lng;
      }
      tripMap.set(key, trip);
      trips.push(trip);
    }
  }

  return trips;
}
