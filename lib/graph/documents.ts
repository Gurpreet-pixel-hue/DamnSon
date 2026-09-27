import type { ComposedJourney } from "@/lib/contract/compose";
import { analyzeJourney } from "@/lib/contract/analyze";

export interface DocumentChecklistEntry {
  key: string;
  label: string;
  usedIn: string[];
  producedBy: string[];
}

export function buildDocumentChecklist(
  journey: ComposedJourney,
  completed: ReadonlySet<string>
): DocumentChecklistEntry[] {
  const analysis = analyzeJourney(journey);
  const evaluationOrder = analysis.ok
    ? analysis.order
    : journey.steps.map((s) => s.id);

  const stepMap = new Map(journey.steps.map((s) => [s.id, s]));

  // Pre-index which steps produce each documentTypeId through outputs
  const producersByDocType = new Map<string, string[]>();
  for (const step of journey.steps) {
    if (step.kind === "milestone") continue;
    for (const output of step.outputs) {
      const list = producersByDocType.get(output.documentTypeId) ?? [];
      list.push(step.id);
      producersByDocType.set(output.documentTypeId, list);
    }
  }

  const entriesByKey = new Map<string, DocumentChecklistEntry>();
  const checklist: DocumentChecklistEntry[] = [];

  for (const stepId of evaluationOrder) {
    const step = stepMap.get(stepId);
    if (!step) continue;
    if (step.kind === "milestone") continue;
    if (step.applicability === "optional" || step.requirement.kind === "optional") continue;
    if (completed.has(step.id)) continue;

    for (const doc of step.documents) {
      const existing = entriesByKey.get(doc.key);
      if (existing) {
        if (!existing.usedIn.includes(step.id)) {
          existing.usedIn.push(step.id);
        }
      } else {
        const label = doc.personLabel ? `${doc.name} (${doc.personLabel})` : doc.name;
        const producers = (producersByDocType.get(doc.documentTypeId) ?? []).filter(
          (pId) => pId !== step.id
        );

        const entry: DocumentChecklistEntry = {
          key: doc.key,
          label,
          usedIn: [step.id],
          producedBy: producers,
        };

        entriesByKey.set(doc.key, entry);
        checklist.push(entry);
      }
    }
  }

  return checklist;
}
