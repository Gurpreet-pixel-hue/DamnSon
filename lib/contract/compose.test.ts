import { describe, expect, it } from "vitest";
import { readModuleFixture, readTemplateFixture } from "@/data/fixtures/v3/loadFixture";
import { analyzeJourney } from "./analyze";
import { composeJourney, type ComposedJourney, type ComposedStep } from "./compose";
import type { Facts } from "./facts";
import { approvalModuleSchema, journeyTemplateSchema, type ApprovalModule } from "./schema";

// PRD App. D.7 §4: composition of example-startup. Edge ids are "<from>><to>"; R = requires, r = recommended_after.
const MODULE_NAMES = ["ex-banking", "ex-directors", "ex-food", "ex-incorporation", "ex-local", "ex-recognition", "ex-tax"] as const;

const modules = (): ApprovalModule[] => MODULE_NAMES.map((name) => approvalModuleSchema.parse(readModuleFixture(name)));
const template = () => journeyTemplateSchema.parse(readTemplateFixture("example-startup"));
const compose = (facts: Facts): ComposedJourney => composeJourney(template(), modules(), facts);

const ids = (journey: ComposedJourney): string[] => journey.steps.map((s) => s.id);
const applicability = (journey: ComposedJourney): [string, string][] => journey.steps.map((s) => [s.id, s.applicability]);
const edges = (journey: ComposedJourney): string[] =>
  journey.edges.map((e) => `${e.id} ${e.kind === "requires" ? "R" : "r"} ${e.origin}`);
const excluded = (journey: ComposedJourney): string[] =>
  journey.excluded.map((x) => (x.kind === "module" ? `module ${x.moduleId}` : `step ${x.stepId}`));
const questions = (journey: ComposedJourney): [string, string, number][] =>
  journey.questions.map((q) => [q.fact, q.answerType, q.affectedStepCount]);
function actionStep(journey: ComposedJourney, id: string): Extract<ComposedStep, { kind: "government" | "non_government" }> {
  const step = journey.steps.find((s) => s.id === id);
  if (step === undefined) throw new Error(`no step ${id}`);
  if (step.kind === "milestone") throw new Error(`${id} is a milestone`);
  return step;
}

const FACTS_A: Facts = { "business.sector": "it_saas", "company.founders_count": 2, "employees.count": 5 };

describe("A. SaaS (App. D.7 §4A)", () => {
  const journey = compose(FACTS_A);

  it("includes nine steps with the expected applicability", () => {
    expect(applicability(journey)).toEqual([
      ["ex-directors.kyc.1", "applies"],
      ["ex-directors.kyc.2", "applies"],
      ["ex-incorporation.file", "applies"],
      ["ex-incorporation.incorporated", "applies"],
      ["ex-banking.open-account", "applies"],
      ["ex-food.apply", "may_apply"],
      ["ex-recognition.apply", "optional"],
      ["ex-local.intimation", "applies"],
      ["ex-local.display", "applies"],
    ]);
  });

  it("keeps module and link edges, and needs no bridge for the excluded registration step", () => {
    expect(edges(journey)).toEqual([
      "ex-incorporation.file>ex-incorporation.incorporated R module",
      "ex-local.intimation>ex-local.display R module",
      "ex-directors.kyc.1>ex-incorporation.file R link",
      "ex-directors.kyc.2>ex-incorporation.file R link",
      "ex-incorporation.incorporated>ex-banking.open-account R link",
      "ex-incorporation.incorporated>ex-food.apply R link",
      "ex-incorporation.incorporated>ex-recognition.apply R link",
      "ex-banking.open-account>ex-recognition.apply r link",
      "ex-incorporation.incorporated>ex-local.intimation R link",
    ]);
    expect(edges(journey).some((e) => e.endsWith("bridge"))).toBe(false);
  });

  it("excludes the ex-tax module and the registration step", () => {
    expect(excluded(journey)).toEqual(["module ex-tax", "step ex-local.registration"]);
  });

  it("asks only the two questions that still change the graph", () => {
    expect(questions(journey)).toEqual([
      ["business.serves_food", "boolean", 1],
      ["intent.dpiit", "boolean", 1],
    ]);
  });

  it("layers parallel steps together", () => {
    expect(analyzeJourney(journey).layers).toEqual([
      ["ex-directors.kyc.1", "ex-directors.kyc.2"],
      ["ex-incorporation.file"],
      ["ex-incorporation.incorporated"],
      ["ex-banking.open-account", "ex-food.apply", "ex-local.intimation"],
      ["ex-recognition.apply", "ex-local.display"],
    ]);
  });

  it("expands per-person documents once per founder and carries the module's sources", () => {
    const file = actionStep(journey, "ex-incorporation.file");
    expect(file.documents.map((d) => d.key)).toEqual(["office-address-proof", "pan-card-individual#1", "pan-card-individual#2"]);
    expect(file.sources.map((s) => s.id)).toEqual(["ex-portal", "ex-blog"]);
  });
});

describe("B. Food flip (App. D.7 §4B)", () => {
  const journey = compose({ ...FACTS_A, "business.sector": "food_service" });
  const saas = compose(FACTS_A);

  it("keeps the same steps and edges", () => {
    expect(ids(journey)).toEqual(ids(saas));
    expect(edges(journey)).toEqual(edges(saas));
  });

  it("turns ex-food.apply from may_apply into applies", () => {
    expect(actionStep(journey, "ex-food.apply").applicability).toBe("applies");
  });

  it("no longer needs the food question", () => {
    expect(questions(journey)).toEqual([["intent.dpiit", "boolean", 1]]);
  });
});

describe("C. No facts (App. D.7 §4C)", () => {
  const journey = compose({});

  it("includes every module, with unknown conditions shown as may_apply", () => {
    expect(applicability(journey)).toEqual([
      ["ex-directors.kyc.1", "applies"],
      ["ex-incorporation.file", "applies"],
      ["ex-incorporation.incorporated", "applies"],
      ["ex-banking.open-account", "applies"],
      ["ex-tax.register", "may_apply"],
      ["ex-food.apply", "may_apply"],
      ["ex-recognition.apply", "optional"],
      ["ex-local.intimation", "may_apply"],
      ["ex-local.registration", "may_apply"],
      ["ex-local.display", "applies"],
    ]);
    expect(excluded(journey)).toEqual([]);
  });

  it("marks the repeated step and its per-person document as an unknown count", () => {
    const kyc = actionStep(journey, "ex-directors.kyc.1");
    expect(kyc.repeatCountUnknown).toBe(true);
    const file = actionStep(journey, "ex-incorporation.file");
    expect(file.documents.map((d) => d.key)).toEqual(["office-address-proof", "pan-card-individual#1"]);
    expect(file.documents.find((d) => d.key === "pan-card-individual#1")?.countUnknown).toBe(true);
  });

  it("ranks the questions by how many steps each one decides", () => {
    expect(questions(journey)).toEqual([
      ["employees.count", "integer", 3],
      ["business.sector", "enum", 1],
      ["business.serves_food", "boolean", 1],
      ["company.founders_count", "integer", 1],
      ["intent.dpiit", "boolean", 1],
    ]);
  });
});

describe("D. Twelve employees (App. D.7 §4D)", () => {
  const journey = compose({
    "business.sector": "it_saas",
    "company.founders_count": 2,
    "employees.count": 12,
    "business.serves_food": false,
    "intent.dpiit": false,
  });

  it("drops every module and step the facts rule out", () => {
    expect(applicability(journey)).toEqual([
      ["ex-directors.kyc.1", "applies"],
      ["ex-directors.kyc.2", "applies"],
      ["ex-incorporation.file", "applies"],
      ["ex-incorporation.incorporated", "applies"],
      ["ex-banking.open-account", "applies"],
      ["ex-local.registration", "applies"],
      ["ex-local.display", "applies"],
    ]);
    expect(excluded(journey)).toEqual([
      "module ex-tax",
      "module ex-food",
      "module ex-recognition",
      "step ex-local.intimation",
    ]);
  });

  it("has nothing left to ask", () => {
    expect(questions(journey)).toEqual([]);
  });

  it("layers the registration step beside the bank account", () => {
    expect(analyzeJourney(journey).layers).toEqual([
      ["ex-directors.kyc.1", "ex-directors.kyc.2"],
      ["ex-incorporation.file"],
      ["ex-incorporation.incorporated"],
      ["ex-banking.open-account", "ex-local.registration"],
      ["ex-local.display"],
    ]);
  });
});

// E. Bridging: an excluded middle step must connect its prerequisites to its dependents (§8.5).
const CHAIN_STEP = {
  kind: "government",
  title: "Example chain step",
  description: "Synthetic step used by the bridging case.",
  requirement: { kind: "mandatory" },
  authoritySlug: "example-authority",
  department: "Example Department",
  mode: "online",
  officeType: "online_portal",
  forms: [],
  documents: [],
  outputs: [],
  fee: { kind: "free", sourceRef: "ex-portal" },
  timeline: { officialSla: { kind: "unknown" }, conditional: [] },
  sourceIds: ["ex-portal"],
  review: { status: "unverified" },
} as const;

const chainModule = (): ApprovalModule =>
  approvalModuleSchema.parse({
    schemaVersion: 3,
    moduleId: "ex-chain",
    version: 1,
    title: "Example bridging chain",
    summary: "Synthetic test module: s-a requires s-x requires s-b, with s-x recommended before s-c.",
    authority: { slug: "example-authority", name: "Example Authority", tier: "other", officialUrl: "https://www.india.gov.in/" },
    eligibility: [],
    sources: [
      { id: "ex-portal", url: "https://www.india.gov.in/", title: "National Portal of India", kind: "portal", retrievedOn: "2026-09-26" },
    ],
    steps: [
      { ...CHAIN_STEP, id: "s-a" },
      {
        ...CHAIN_STEP,
        id: "s-x",
        requirement: { kind: "conditional", condition: "Registering for GST now", rule: { fact: "intent.gst_now", op: "eq", value: true } },
      },
      { ...CHAIN_STEP, id: "s-b" },
      { ...CHAIN_STEP, id: "s-c" },
    ],
    edges: [
      { id: "e-a-x", from: "s-a", to: "s-x", kind: "requires" },
      { id: "e-x-b", from: "s-x", to: "s-b", kind: "requires" },
      { id: "e-x-c", from: "s-x", to: "s-c", kind: "recommended_after" },
    ],
    entrySteps: ["s-a"],
    exitSteps: ["s-b", "s-c"],
    meta: { origin: "curated", updatedAt: "2026-09-26T10:00:00+05:30" },
  });

const chainTemplate = () =>
  journeyTemplateSchema.parse({
    schemaVersion: 3,
    taskId: "ex-bridge",
    revision: 1,
    title: "Example: bridging (synthetic test data)",
    summary: "Synthetic template used only by tests.",
    jurisdiction: { country: "IN", state: "Maharashtra" },
    category: "business_and_trade",
    keywords: ["example"],
    sources: [],
    questions: [{ fact: "intent.gst_now", text: "Do you want to register for GST now?" }],
    modules: [{ moduleId: "ex-chain", version: 1, requirement: "mandatory", activation: null, reason: "Synthetic bridging case" }],
    links: [],
    meta: { origin: "curated", updatedAt: "2026-09-26T10:00:00+05:30" },
  });

describe("E. Bridging (App. D.7 §4E)", () => {
  const composeChain = (facts: Facts): ComposedJourney => composeJourney(chainTemplate(), [chainModule()], facts);

  it("bridges prerequisites to dependents when the middle step is excluded", () => {
    const journey = composeChain({ "intent.gst_now": false });
    expect(ids(journey)).toEqual(["ex-chain.s-a", "ex-chain.s-b", "ex-chain.s-c"]);
    expect(edges(journey)).toEqual(["ex-chain.s-a>ex-chain.s-b R bridge", "ex-chain.s-a>ex-chain.s-c r bridge"]);
  });

  it("keeps the module's own edges when the middle step applies", () => {
    const journey = composeChain({ "intent.gst_now": true });
    expect(ids(journey)).toEqual(["ex-chain.s-a", "ex-chain.s-x", "ex-chain.s-b", "ex-chain.s-c"]);
    expect(edges(journey)).toEqual([
      "ex-chain.s-a>ex-chain.s-x R module",
      "ex-chain.s-x>ex-chain.s-b R module",
      "ex-chain.s-x>ex-chain.s-c r module",
    ]);
  });

  it("shows the middle step as may_apply and asks for the fact when it is unknown", () => {
    const journey = composeChain({});
    expect(actionStep(journey, "ex-chain.s-x").applicability).toBe("may_apply");
    expect(questions(journey)).toEqual([["intent.gst_now", "boolean", 1]]);
  });
});

describe("F. Determinism (App. D.7 §4F)", () => {
  it("does not depend on the order of the modules array", () => {
    const forwards = composeJourney(template(), modules(), FACTS_A);
    const backwards = composeJourney(template(), [...modules()].reverse(), FACTS_A);
    expect(JSON.stringify(backwards)).toBe(JSON.stringify(forwards));
  });
});
