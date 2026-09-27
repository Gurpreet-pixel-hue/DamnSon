import { FACTS, type FactKey } from "./facts";
import { composeJourney, type ComposedJourney } from "./compose";
import { isOfficialUrl } from "./officialSources";
import { checkCondition, ruleConditions, ruleFacts } from "./rules";
import type { ApprovalModule, JourneyTemplate, Rule } from "./schema";

export type IssueCode =
  // graph structure (errors)
  | "DUPLICATE_NODE_ID"
  | "DUPLICATE_EDGE_ID"
  | "UNKNOWN_NODE_REF"
  | "SELF_LOOP"
  | "DUPLICATE_EDGE"
  | "CYCLE"
  // module content (errors)
  | "INVERTED_RANGE"
  | "DUPLICATE_SOURCE_ID"
  | "UNKNOWN_SOURCE_REF"
  | "UNKNOWN_ENTRY_EXIT"
  | "VERIFIED_WITHOUT_OFFICIAL_SOURCE"
  | "OPTIONAL_PREREQUISITE"
  | "REPEAT_FACT_NOT_INTEGER"
  | "AUTHORITY_URL_NOT_OFFICIAL"
  | "RULE_TYPE_MISMATCH"
  | "THRESHOLD_WITHOUT_SOURCE"
  // template (errors)
  | "UNKNOWN_MODULE"
  | "DUPLICATE_MODULE"
  | "MODULE_REQUIREMENT_MISMATCH"
  | "UNKNOWN_LINK_MODULE"
  | "DUPLICATE_LINK_ID"
  | "DUPLICATE_QUESTION_FACT"
  | "QUESTION_OPTIONS_MISMATCH"
  // warnings
  | "NO_OFFICIAL_SOURCE"
  | "UNOFFICIAL_SOURCE"
  | "CONDITION_WITHOUT_RULE"
  | "UNUSED_QUESTION"
  | "FACT_WITHOUT_QUESTION"
  | "DOC_PRODUCED_BUT_NOT_LINKED";

const WARNINGS: ReadonlySet<IssueCode> = new Set<IssueCode>([
  "NO_OFFICIAL_SOURCE",
  "UNOFFICIAL_SOURCE",
  "CONDITION_WITHOUT_RULE",
  "UNUSED_QUESTION",
  "FACT_WITHOUT_QUESTION",
  "DOC_PRODUCED_BUT_NOT_LINKED",
]);

export interface GraphIssue {
  severity: "error" | "warning";
  code: IssueCode;
  message: string;
  moduleId?: string;
  stepIds?: string[];
  edgeIds?: string[];
}
export interface GraphAnalysis {
  ok: boolean;
  order: string[];
  layers: string[][];
  issues: GraphIssue[];
}

function issue(code: IssueCode, message: string, extra: Omit<GraphIssue, "severity" | "code" | "message"> = {}): GraphIssue {
  return { severity: WARNINGS.has(code) ? "warning" : "error", code, message, ...extra };
}

/** Structural checks + deterministic order (Kahn, ties by position) + layers (longest path). */
export function analyzeGraph(graph: {
  steps: readonly { id: string }[];
  edges: readonly { id: string; from: string; to: string }[];
}): GraphAnalysis {
  const issues: GraphIssue[] = [];
  const position = new Map<string, number>();
  graph.steps.forEach((s, i) => {
    if (position.has(s.id)) issues.push(issue("DUPLICATE_NODE_ID", `duplicate step id ${s.id}`, { stepIds: [s.id] }));
    else position.set(s.id, i);
  });
  const edgeIds = new Set<string>();
  const pairs = new Set<string>();
  const valid: { from: string; to: string }[] = [];
  for (const e of graph.edges) {
    if (edgeIds.has(e.id)) issues.push(issue("DUPLICATE_EDGE_ID", `duplicate edge id ${e.id}`, { edgeIds: [e.id] }));
    edgeIds.add(e.id);
    if (!position.has(e.from) || !position.has(e.to)) {
      issues.push(issue("UNKNOWN_NODE_REF", `edge ${e.id} references an unknown step`, { edgeIds: [e.id] }));
      continue;
    }
    if (e.from === e.to) {
      issues.push(issue("SELF_LOOP", `edge ${e.id} is a self-loop`, { edgeIds: [e.id], stepIds: [e.from] }));
      continue;
    }
    const key = `${e.from}>${e.to}`;
    if (pairs.has(key)) {
      issues.push(issue("DUPLICATE_EDGE", `duplicate edge ${key}`, { edgeIds: [e.id] }));
      continue;
    }
    pairs.add(key);
    valid.push(e);
  }
  const ids = [...position.keys()];
  const indegree = new Map(ids.map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>(ids.map((id) => [id, []]));
  const incoming = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of valid) {
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
    outgoing.get(e.from)?.push(e.to);
    incoming.get(e.to)?.push(e.from);
  }
  const ready = ids.filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => (position.get(a) ?? 0) - (position.get(b) ?? 0));
    const next = ready.shift();
    if (next === undefined) break;
    order.push(next);
    for (const to of outgoing.get(next) ?? []) {
      const d = (indegree.get(to) ?? 0) - 1;
      indegree.set(to, d);
      if (d === 0) ready.push(to);
    }
  }
  if (order.length < ids.length) {
    const stuck = ids.filter((id) => !order.includes(id));
    issues.push(issue("CYCLE", `cycle among ${stuck.join(", ")}`, { stepIds: stuck }));
  }
  const errors = issues.some((i) => i.severity === "error");
  if (errors) return { ok: false, order: [], layers: [], issues };
  const layerOf = new Map<string, number>();
  for (const id of order) {
    const preds = incoming.get(id) ?? [];
    layerOf.set(id, preds.length === 0 ? 0 : 1 + Math.max(...preds.map((p) => layerOf.get(p) ?? 0)));
  }
  const layers: string[][] = [];
  for (const id of order) {
    const l = layerOf.get(id) ?? 0;
    (layers[l] ??= []).push(id);
  }
  return { ok: true, order, layers, issues };
}

function withErrorsFrom(base: GraphAnalysis, extra: GraphIssue[]): GraphAnalysis {
  const issues = [...base.issues, ...extra];
  const ok = !issues.some((i) => i.severity === "error");
  return ok ? { ...base, ok, issues } : { ok: false, order: [], layers: [], issues };
}

function ruleIssues(rule: Rule, sourceIds: ReadonlySet<string>, where: string, moduleId?: string): GraphIssue[] {
  const out: GraphIssue[] = [];
  for (const c of ruleConditions(rule)) {
    for (const p of checkCondition(c)) out.push(issue(p, `${where}: ${p} on ${c.fact} ${c.op}`, moduleId ? { moduleId } : {}));
    if (c.sourceRef !== undefined && !sourceIds.has(c.sourceRef)) {
      out.push(issue("UNKNOWN_SOURCE_REF", `${where}: unknown sourceRef ${c.sourceRef}`, moduleId ? { moduleId } : {}));
    }
  }
  return out;
}

export function analyzeModule(m: ApprovalModule): GraphAnalysis {
  const base = analyzeGraph({ steps: m.steps, edges: m.edges });
  const out: GraphIssue[] = [];
  const moduleId = m.moduleId;
  const sourceIds = new Set<string>();
  for (const s of m.sources) {
    if (sourceIds.has(s.id)) out.push(issue("DUPLICATE_SOURCE_ID", `duplicate source id ${s.id}`, { moduleId }));
    sourceIds.add(s.id);
    if (!isOfficialUrl(s.url)) out.push(issue("UNOFFICIAL_SOURCE", `source ${s.id} is not official: ${s.url}`, { moduleId }));
  }
  const official = new Set(m.sources.filter((s) => isOfficialUrl(s.url)).map((s) => s.id));
  if (!isOfficialUrl(m.authority.officialUrl)) {
    out.push(issue("AUTHORITY_URL_NOT_OFFICIAL", `authority URL is not official: ${m.authority.officialUrl}`, { moduleId }));
  }
  const stepIds = new Set(m.steps.map((s) => s.id));
  for (const id of [...m.entrySteps, ...m.exitSteps]) {
    if (!stepIds.has(id)) out.push(issue("UNKNOWN_ENTRY_EXIT", `entry/exit step ${id} does not exist`, { moduleId, stepIds: [id] }));
  }
  const ref = (id: string | undefined, where: string): void => {
    if (id !== undefined && !sourceIds.has(id)) out.push(issue("UNKNOWN_SOURCE_REF", `${where}: unknown sourceRef ${id}`, { moduleId }));
  };
  m.eligibility.forEach((e, i) => {
    ref(e.sourceRef, `eligibility[${i}]`);
    if (e.rule) out.push(...ruleIssues(e.rule, sourceIds, `eligibility[${i}]`, moduleId));
  });
  const optional = new Set(m.steps.filter((s) => s.requirement.kind === "optional").map((s) => s.id));
  for (const s of m.steps) {
    const where = `step ${s.id}`;
    if (s.requirement.kind === "conditional") {
      if (s.requirement.rule) out.push(...ruleIssues(s.requirement.rule, sourceIds, where, moduleId));
      else out.push(issue("CONDITION_WITHOUT_RULE", `${where}: condition has no rule, shown as "may apply"`, { moduleId, stepIds: [s.id] }));
    }
    if (s.kind === "milestone") continue;
    s.sourceIds.forEach((id) => ref(id, where));
    if (s.fee.kind === "range" && s.fee.minINR > s.fee.maxINR) out.push(issue("INVERTED_RANGE", `${where}: fee min > max`, { moduleId, stepIds: [s.id] }));
    if (s.fee.kind !== "unknown") ref(s.fee.sourceRef, `${where} fee`);
    const sla = s.timeline.officialSla;
    if (sla.kind === "sla") {
      ref(sla.sourceRef, `${where} SLA`);
      if (sla.duration.minDays > sla.duration.maxDays) out.push(issue("INVERTED_RANGE", `${where}: SLA min > max`, { moduleId, stepIds: [s.id] }));
    } else if (sla.kind === "no_fixed_sla") ref(sla.sourceRef, `${where} SLA`);
    for (const c of s.timeline.conditional) {
      ref(c.sourceRef, `${where} conditional timeline`);
      if (c.rule) out.push(...ruleIssues(c.rule, sourceIds, `${where} conditional timeline`, moduleId));
      if (c.duration.kind === "range" && c.duration.minDays > c.duration.maxDays) {
        out.push(issue("INVERTED_RANGE", `${where}: conditional min > max`, { moduleId, stepIds: [s.id] }));
      }
    }
    if (s.repeat && FACTS[s.repeat.fact].type !== "integer") {
      out.push(issue("REPEAT_FACT_NOT_INTEGER", `${where}: repeat fact ${s.repeat.fact} is not an integer fact`, { moduleId, stepIds: [s.id] }));
    }
    for (const d of s.documents) {
      if (d.perPerson && FACTS[d.perPerson.fact].type !== "integer") {
        out.push(issue("REPEAT_FACT_NOT_INTEGER", `${where}: perPerson fact ${d.perPerson.fact} is not an integer fact`, { moduleId, stepIds: [s.id] }));
      }
    }
    const hasOfficial = s.sourceIds.some((id) => official.has(id));
    if (s.review.status === "verified" && !hasOfficial) {
      out.push(issue("VERIFIED_WITHOUT_OFFICIAL_SOURCE", `${where}: verified without an official source`, { moduleId, stepIds: [s.id] }));
    }
    if (s.kind === "government" && !hasOfficial) {
      out.push(issue("NO_OFFICIAL_SOURCE", `${where}: no official source`, { moduleId, stepIds: [s.id] }));
    }
  }
  for (const e of m.edges) {
    if (e.kind === "requires" && optional.has(e.from) && !optional.has(e.to)) {
      out.push(issue("OPTIONAL_PREREQUISITE", `edge ${e.id}: optional step ${e.from} cannot be required by ${e.to}`, { moduleId, edgeIds: [e.id] }));
    }
  }
  return withErrorsFrom({ ...base, issues: base.issues.map((i) => ({ ...i, moduleId })) }, out.map((i) => ({ ...i, moduleId })));
}

/** Publish-time validation: template rules, every pinned module, and the maximal composition. */
export function analyzeTemplate(t: JourneyTemplate, modules: readonly ApprovalModule[]): GraphAnalysis {
  const out: GraphIssue[] = [];
  const byId = new Map(modules.map((m) => [m.moduleId, m]));
  const seen = new Set<string>();
  const sourceIds = new Set(t.sources.map((s) => s.id));
  const readFacts = new Set<FactKey>();
  for (const entry of t.modules) {
    if (seen.has(entry.moduleId)) out.push(issue("DUPLICATE_MODULE", `module ${entry.moduleId} listed twice`));
    seen.add(entry.moduleId);
    const m = byId.get(entry.moduleId);
    if (!m || m.version !== entry.version) out.push(issue("UNKNOWN_MODULE", `module ${entry.moduleId}@${entry.version} not found`));
    if (entry.requirement === "mandatory" && entry.activation !== null) {
      out.push(issue("MODULE_REQUIREMENT_MISMATCH", `mandatory module ${entry.moduleId} must have activation null`));
    }
    if (entry.requirement === "conditional" && entry.activation === null) {
      out.push(issue("CONDITION_WITHOUT_RULE", `conditional module ${entry.moduleId} has no activation rule, shown as "may apply"`));
    }
    if (entry.activation) {
      out.push(...ruleIssues(entry.activation, sourceIds, `activation of ${entry.moduleId}`));
      ruleFacts(entry.activation).forEach((f) => readFacts.add(f));
    }
  }
  const linkIds = new Set<string>();
  for (const l of t.links) {
    if (linkIds.has(l.id)) out.push(issue("DUPLICATE_LINK_ID", `duplicate link id ${l.id}`));
    linkIds.add(l.id);
    if (!seen.has(l.fromModule) || !seen.has(l.toModule)) out.push(issue("UNKNOWN_LINK_MODULE", `link ${l.id} references a module not in the template`));
  }
  const questionFacts = new Set<FactKey>();
  for (const q of t.questions) {
    if (questionFacts.has(q.fact)) out.push(issue("DUPLICATE_QUESTION_FACT", `two questions ask ${q.fact}`));
    questionFacts.add(q.fact);
    const def = FACTS[q.fact];
    const optionsOk =
      def.type === "enum"
        ? q.options !== undefined && q.options.every((o) => typeof o.value === "string" && def.values.includes(o.value))
        : q.options === undefined;
    if (!optionsOk) out.push(issue("QUESTION_OPTIONS_MISMATCH", `question ${q.fact}: options must be given for enum facts only, with registry values`));
  }
  for (const entry of t.modules) {
    const m = byId.get(entry.moduleId);
    if (!m) continue;
    const a = analyzeModule(m);
    out.push(...a.issues.map((i) => ({ ...i, moduleId: m.moduleId })));
    for (const s of m.steps) {
      if (s.requirement.kind === "conditional" && s.requirement.rule) ruleFacts(s.requirement.rule).forEach((f) => readFacts.add(f));
      if (s.kind !== "milestone") {
        if (s.repeat) readFacts.add(s.repeat.fact);
        s.documents.forEach((d) => d.perPerson && readFacts.add(d.perPerson.fact));
        s.timeline.conditional.forEach((c) => c.rule && ruleFacts(c.rule).forEach((f) => readFacts.add(f)));
      }
    }
  }
  for (const f of questionFacts) if (!readFacts.has(f)) out.push(issue("UNUSED_QUESTION", `question ${f} changes nothing`));
  for (const f of readFacts) if (!questionFacts.has(f)) out.push(issue("FACT_WITHOUT_QUESTION", `fact ${f} is read by a rule but never asked`));

  const blocking = out.some((i) => i.severity === "error");
  if (blocking) return { ok: false, order: [], layers: [], issues: out };
  const maximal = composeJourney(t, modules, {}, { maximal: true });
  return withErrorsFrom(analyzeJourney(maximal), out);
}

/** Checks for a composed journey (runtime, before render). */
export function analyzeJourney(j: ComposedJourney): GraphAnalysis {
  const base = analyzeGraph({ steps: j.steps, edges: j.edges });
  if (!base.ok) return base;
  const preds = new Map<string, string[]>(j.steps.map((s) => [s.id, []]));
  for (const e of j.edges) preds.get(e.to)?.push(e.from);
  const ancestors = new Map<string, Set<string>>();
  for (const id of base.order) {
    const set = new Set<string>();
    for (const p of preds.get(id) ?? []) {
      set.add(p);
      ancestors.get(p)?.forEach((a) => set.add(a));
    }
    ancestors.set(id, set);
  }
  const producers = new Map<string, string[]>();
  for (const s of j.steps) {
    if (s.kind === "milestone") continue;
    for (const o of s.outputs) producers.set(o.documentTypeId, [...(producers.get(o.documentTypeId) ?? []), s.id]);
  }
  const warnings: GraphIssue[] = [];
  for (const s of j.steps) {
    if (s.kind === "milestone") continue;
    for (const d of s.documents) {
      const made = (producers.get(d.documentTypeId) ?? []).filter((p) => p !== s.id);
      if (made.length > 0 && !made.some((p) => ancestors.get(s.id)?.has(p))) {
        warnings.push(issue("DOC_PRODUCED_BUT_NOT_LINKED", `${s.id} needs ${d.documentTypeId}, produced by ${made.join(", ")} without a path`, { stepIds: [s.id, ...made] }));
      }
    }
  }
  return { ...base, issues: [...base.issues, ...warnings] };
}
