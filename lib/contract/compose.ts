import { FACTS, isValidFactValue, type FactDef, type FactKey, type Facts } from "./facts";
import { evaluateRule, ruleFacts, type TriState } from "./rules";
import type { ActionStep, ApprovalModule, Edge, JourneyTemplate, Question, Rule, Source, Step } from "./schema";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type Applicability = "applies" | "may_apply" | "optional";

export interface ComposedDocument {
  key: string; // documentTypeId, or documentTypeId#i for per-person copies
  documentTypeId: string;
  name: string;
  personIndex?: number;
  personLabel?: string;
  countUnknown?: boolean;
  acceptedFormats?: string[];
  maxSizeKB?: number;
  note?: string;
}

interface ComposedBase {
  id: string; // "<moduleId>.<stepId>", or "<moduleId>.<stepId>.<i>" for repeated steps
  moduleId: string;
  localId: string;
  applicability: Applicability;
  reasons: string[];
}
export type ComposedActionStep = DistributiveOmit<ActionStep, "id" | "documents" | "sourceIds"> &
  ComposedBase & {
    repeatIndex?: number;
    repeatCountUnknown?: boolean;
    documents: ComposedDocument[];
    sources: Source[];
  };
export type ComposedMilestone = Omit<Extract<Step, { kind: "milestone" }>, "id"> & ComposedBase;
export type ComposedStep = ComposedActionStep | ComposedMilestone;

export interface ComposedEdge {
  id: string; // "<from>><to>"
  from: string;
  to: string;
  kind: Edge["kind"];
  origin: "module" | "link" | "bridge";
  note?: string;
  via?: string;
}

export type ExcludedItem =
  | { kind: "module"; moduleId: string; title: string; reason: string; facts: FactKey[] }
  | { kind: "step"; moduleId: string; stepId: string; title: string; reason: string; facts: FactKey[] };

export interface DecisiveQuestion extends Question {
  answerType: FactDef["type"];
  affectedStepCount: number;
}

export interface ComposedJourney {
  taskId: string;
  revision: number;
  title: string;
  summary: string;
  jurisdiction: JourneyTemplate["jurisdiction"];
  category: JourneyTemplate["category"];
  facts: Facts;
  steps: ComposedStep[];
  edges: ComposedEdge[];
  excluded: ExcludedItem[];
  questions: DecisiveQuestion[];
}

export class ComposeError extends Error {}

type Tri = TriState | "optional";

function repeatCount(facts: Facts, fact: FactKey, max: number, maximal: boolean): { count: number; unknown: boolean } {
  if (maximal) return { count: 1, unknown: false };
  const v = facts[fact];
  if (typeof v === "number" && Number.isInteger(v) && isValidFactValue(fact, v)) {
    return { count: Math.min(Math.max(v, 1), max), unknown: false };
  }
  return { count: 1, unknown: true };
}

/**
 * Compose the citizen's journey from a template, its pinned modules and the citizen's facts (PRD §8.5).
 * `maximal: true` switches every module and conditional step on (publish-time validation).
 */
export function composeJourney(
  template: JourneyTemplate,
  modules: readonly ApprovalModule[],
  facts: Facts,
  opts: { maximal?: boolean } = {},
): ComposedJourney {
  const maximal = opts.maximal === true;
  const evaluate = (rule: Rule): TriState => (maximal ? "true" : evaluateRule(rule, facts));
  const byId = new Map(modules.map((m) => [m.moduleId, m]));

  const built: { step: ComposedStep; excluded: boolean }[] = [];
  const copiesOf = new Map<string, string[]>(); // "<moduleId>.<stepId>" -> composed ids
  const excluded: ExcludedItem[] = [];
  const edges: ComposedEdge[] = [];
  const edgeIndex = new Map<string, number>();

  const addEdge = (e: Omit<ComposedEdge, "id">): void => {
    const key = `${e.from}>${e.to}`;
    const at = edgeIndex.get(key);
    if (at === undefined) {
      edgeIndex.set(key, edges.length);
      edges.push({ id: key, ...e });
      return;
    }
    const existing = edges[at];
    if (existing && existing.kind === "recommended_after" && e.kind === "requires") existing.kind = "requires";
  };

  // 1–6: modules, steps, repeats, documents, module edges
  for (const entry of template.modules) {
    const mod = byId.get(entry.moduleId);
    if (!mod || mod.version !== entry.version) {
      throw new ComposeError(`module ${entry.moduleId}@${entry.version} not provided`);
    }
    // activation null: mandatory -> applies, optional -> optional, conditional -> "may apply" (rule not modelled yet)
    const modState: Tri =
      entry.activation !== null
        ? evaluate(entry.activation)
        : entry.requirement === "optional"
          ? "optional"
          : entry.requirement === "conditional" && !maximal
            ? "unknown"
            : "true";
    const modFacts = entry.activation === null ? [] : ruleFacts(entry.activation);
    const moduleOff = modState === "false";
    const moduleOptional = entry.requirement === "optional" && !moduleOff;
    if (moduleOff) {
      excluded.push({ kind: "module", moduleId: mod.moduleId, title: mod.title, reason: entry.reason, facts: modFacts });
    }
    const sourcesById = new Map(mod.sources.map((s) => [s.id, s]));

    for (const step of mod.steps) {
      const reasons: string[] = entry.requirement === "mandatory" ? [] : [entry.reason];
      let stepState: Tri = "true";
      if (step.requirement.kind === "conditional") {
        reasons.push(step.requirement.condition);
        stepState = step.requirement.rule ? evaluate(step.requirement.rule) : maximal ? "true" : "unknown";
      } else if (step.requirement.kind === "optional") {
        stepState = "optional";
        if (step.requirement.note) reasons.push(step.requirement.note);
      }
      const stepOff = !moduleOff && stepState === "false";
      const applicability: Applicability =
        moduleOptional || stepState === "optional"
          ? "optional"
          : modState === "unknown" || stepState === "unknown"
            ? "may_apply"
            : "applies";
      const base = `${mod.moduleId}.${step.id}`;
      const ids: string[] = [];

      if (step.kind === "milestone") {
        const { id: localId, ...rest } = step;
        ids.push(base);
        built.push({
          step: { ...rest, id: base, moduleId: mod.moduleId, localId, applicability, reasons },
          excluded: moduleOff || stepOff,
        });
      } else {
        const { id: localId, documents: rawDocuments, sourceIds, ...rest } = step;
        const rep = step.repeat ? repeatCount(facts, step.repeat.fact, step.repeat.max, maximal) : undefined;
        const count = rep ? rep.count : 1;
        const sources = sourceIds.flatMap((sid) => {
          const s = sourcesById.get(sid);
          return s ? [s] : [];
        });
        for (let i = 1; i <= count; i += 1) {
          const id = step.repeat ? `${base}.${i}` : base;
          const documents: ComposedDocument[] = rawDocuments.flatMap((d) => {
            const { perPerson, ...doc } = d;
            if (!perPerson) return [{ ...doc, key: d.documentTypeId }];
            if (step.repeat && step.repeat.fact === perPerson.fact) {
              return [{ ...doc, key: `${d.documentTypeId}#${i}`, personIndex: i, personLabel: `${perPerson.label} ${i}` }];
            }
            const n = repeatCount(facts, perPerson.fact, 10, maximal);
            return Array.from({ length: n.count }, (_, k) => ({
              ...doc,
              key: `${d.documentTypeId}#${k + 1}`,
              personIndex: k + 1,
              personLabel: `${perPerson.label} ${k + 1}`,
              ...(n.unknown ? { countUnknown: true } : {}),
            }));
          });
          ids.push(id);
          built.push({
            step: {
              ...rest,
              id,
              moduleId: mod.moduleId,
              localId,
              applicability,
              reasons,
              title: step.repeat ? `${step.title} (${step.repeat.label} ${i})` : step.title,
              documents,
              sources,
              ...(step.repeat ? { repeatIndex: i } : {}),
              ...(rep?.unknown ? { repeatCountUnknown: true } : {}),
            },
            excluded: moduleOff || stepOff,
          });
        }
      }
      copiesOf.set(base, ids);
      if (stepOff && step.requirement.kind === "conditional") {
        excluded.push({
          kind: "step",
          moduleId: mod.moduleId,
          stepId: base,
          title: step.title,
          reason: step.requirement.condition,
          facts: step.requirement.rule ? ruleFacts(step.requirement.rule) : [],
        });
      }
    }

    const repeatFact = new Map(mod.steps.map((s) => [s.id, s.kind === "milestone" ? undefined : s.repeat?.fact]));
    for (const e of mod.edges) {
      const from = copiesOf.get(`${mod.moduleId}.${e.from}`) ?? [];
      const to = copiesOf.get(`${mod.moduleId}.${e.to}`) ?? [];
      const fromFact = repeatFact.get(e.from);
      const pairwise = fromFact !== undefined && fromFact === repeatFact.get(e.to);
      from.forEach((fromId, a) => {
        to.forEach((toId, b) => {
          if (pairwise && a !== b) return;
          addEdge({ from: fromId, to: toId, kind: e.kind, origin: "module", ...(e.note ? { note: e.note } : {}), ...(e.via ? { via: e.via } : {}) });
        });
      });
    }
  }

  // 6: template links, exit steps -> entry steps
  for (const link of template.links) {
    const fromMod = byId.get(link.fromModule);
    const toMod = byId.get(link.toModule);
    if (!fromMod || !toMod) throw new ComposeError(`link ${link.id} references a missing module`);
    const from = fromMod.exitSteps.flatMap((s) => copiesOf.get(`${fromMod.moduleId}.${s}`) ?? []);
    const to = toMod.entrySteps.flatMap((s) => copiesOf.get(`${toMod.moduleId}.${s}`) ?? []);
    for (const f of from) {
      for (const t of to) {
        addEdge({ from: f, to: t, kind: link.kind, origin: "link", ...(link.note ? { note: link.note } : {}), ...(link.via ? { via: link.via } : {}) });
      }
    }
  }

  // 7: remove excluded steps in build order, bridging prerequisites to dependents
  let live = edges;
  for (const b of built) {
    if (!b.excluded) continue;
    const x = b.step.id;
    const ins = live.filter((e) => e.to === x);
    const outs = live.filter((e) => e.from === x);
    live = live.filter((e) => e.from !== x && e.to !== x);
    const index = new Map(live.map((e, i) => [`${e.from}>${e.to}`, i]));
    const reachable = (from: string, to: string): boolean => {
      const stack = [from];
      const seen = new Set<string>();
      while (stack.length > 0) {
        const n = stack.pop();
        if (n === undefined || seen.has(n)) continue;
        if (n === to) return true;
        seen.add(n);
        for (const e of live) if (e.from === n) stack.push(e.to);
      }
      return false;
    };
    for (const p of ins) {
      for (const s of outs) {
        if (p.from === s.to) continue;
        const kind: Edge["kind"] = p.kind === "requires" && s.kind === "requires" ? "requires" : "recommended_after";
        const key = `${p.from}>${s.to}`;
        const at = index.get(key);
        if (at === undefined) {
          if (reachable(p.from, s.to)) continue; // already ordered through another path: no redundant track
          index.set(key, live.length);
          live.push({ id: key, from: p.from, to: s.to, kind, origin: "bridge" });
        } else {
          const existing = live[at];
          if (existing && existing.kind === "recommended_after" && kind === "requires") live[at] = { ...existing, kind: "requires" };
        }
      }
    }
  }
  const steps = built.filter((b) => !b.excluded).map((b) => b.step);

  // 8: decisive questions (PRD §8.6)
  const questions: DecisiveQuestion[] = [];
  if (!maximal) {
    for (const q of template.questions) {
      if (facts[q.fact] !== undefined && isValidFactValue(q.fact, facts[q.fact])) continue;
      const affected = new Set<string>();
      for (const entry of template.modules) {
        if (entry.activation && ruleFacts(entry.activation).includes(q.fact) && evaluate(entry.activation) === "unknown") {
          for (const s of steps) if (s.moduleId === entry.moduleId) affected.add(s.id);
        }
      }
      for (const s of steps) {
        const rule = s.requirement.kind === "conditional" ? s.requirement.rule : undefined;
        if (rule && ruleFacts(rule).includes(q.fact) && evaluate(rule) === "unknown") affected.add(s.id);
        if (s.kind !== "milestone" && s.repeat?.fact === q.fact) affected.add(s.id);
      }
      if (affected.size > 0) questions.push({ ...q, answerType: FACTS[q.fact].type, affectedStepCount: affected.size });
    }
    const order = new Map(template.questions.map((q, i) => [q.fact, i]));
    questions.sort((a, b) => b.affectedStepCount - a.affectedStepCount || (order.get(a.fact) ?? 0) - (order.get(b.fact) ?? 0));
  }

  return {
    taskId: template.taskId,
    revision: template.revision,
    title: template.title,
    summary: template.summary,
    jurisdiction: template.jurisdiction,
    category: template.category,
    facts,
    steps,
    edges: live,
    excluded,
    questions,
  };
}
