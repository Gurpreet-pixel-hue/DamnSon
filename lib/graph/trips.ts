import type { ComposedJourney } from "@/lib/contract/compose";
import type { OfficeType } from "@/lib/contract/schema";
import { analyzeJourney } from "@/lib/contract/analyze";

export interface OfficeTrip {
  key: string;
  name: string;
  officeType: OfficeType;
  lat?: number;
  lng?: number;
  stepIds: string[];
  mayApply: boolean;
}

export function planOfficeTrips(journey: ComposedJourney): OfficeTrip[] {
  const analysis = analyzeJourney(journey);
  const evaluationOrder = analysis.ok
    ? analysis.order
    : journey.steps.map((s) => s.id);

  const stepMap = new Map(journey.steps.map((s) => [s.id, s]));

  const trips: OfficeTrip[] = [];
  const tripMap = new Map<string, OfficeTrip>();

  for (const stepId of evaluationOrder) {
    const step = stepMap.get(stepId);
    if (!step) continue;
    if (step.kind === "milestone") continue;

    // Include steps whose mode isn't online and which aren't optional
    if (
      step.mode === "online" ||
      step.applicability === "optional" ||
      step.requirement.kind === "optional"
    ) {
      continue;
    }

    const name = step.office?.name ?? step.department;
    const key = name.toLowerCase();
    const isMayApply = step.applicability === "may_apply";

    const existingTrip = tripMap.get(key);
    if (existingTrip) {
      existingTrip.stepIds.push(step.id);
      if (isMayApply) {
        existingTrip.mayApply = true;
      }
      if (
        existingTrip.lat === undefined &&
        step.office?.lat !== undefined &&
        step.office?.lng !== undefined
      ) {
        existingTrip.lat = step.office.lat;
        existingTrip.lng = step.office.lng;
      }
    } else {
      const trip: OfficeTrip = {
        key,
        name,
        officeType: step.officeType,
        stepIds: [step.id],
        mayApply: isMayApply,
      };
      if (
        step.office?.lat !== undefined &&
        step.office?.lng !== undefined
      ) {
        trip.lat = step.office.lat;
        trip.lng = step.office.lng;
      }
      tripMap.set(key, trip);
      trips.push(trip);
    }
  }

  return trips;
}
