import { z } from "zod";
import { factKeySchema, factValueSchema, type FactKey, type FactValue } from "./facts";

// ── Primitives ──
export const idSchema = z.string().min(2).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const httpsUrl = z.url({ protocol: /^https$/ }).regex(/^https:\/\//).max(2048);
const isoDate = z.iso.date();
const note = z.string().max(300);

// ── Rules (three-valued, evaluated by rules.ts) ──
export const RULE_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "exists"] as const;
export type RuleOp = (typeof RULE_OPS)[number];
export type Condition = {
  fact: FactKey;
  op: RuleOp;
  value?: FactValue | FactValue[] | undefined;
  valueText?: string | undefined;
  sourceRef?: string | undefined;
};
export type Rule = { all: Rule[] } | { any: Rule[] } | { not: Rule } | Condition;

export const conditionSchema = z.strictObject({
  fact: factKeySchema,
  op: z.enum(RULE_OPS),
  value: z.union([factValueSchema, z.array(factValueSchema).min(1).max(20)]).optional(),
  valueText: z.string().max(200).optional(),
  sourceRef: idSchema.optional(),
});
export const ruleSchema: z.ZodType<Rule> = z.lazy(() =>
  z.union([
    z.strictObject({ all: z.array(ruleSchema).min(1).max(10) }),
    z.strictObject({ any: z.array(ruleSchema).min(1).max(10) }),
    z.strictObject({ not: ruleSchema }),
    conditionSchema,
  ]),
);

// ── Sources, fees, timelines, review ──
export const sourceSchema = z.strictObject({
  id: idSchema,
  url: httpsUrl,
  title: z.string().min(2).max(160),
  kind: z.enum(["portal", "form", "guideline", "fee_schedule", "act_or_rule", "faq", "circular", "other"]),
  retrievedOn: isoDate,
  lastCheckedOn: isoDate.optional(),
  authoritySlug: idSchema.optional(),
});

const recurrence = z.enum(["one_time", "annual"]);
export const feeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("free"), sourceRef: idSchema, note: note.optional() }),
  z.strictObject({
    kind: z.literal("fixed"),
    amountINR: z.number().min(0),
    recurrence,
    sourceRef: idSchema,
    note: note.optional(),
  }),
  z.strictObject({
    kind: z.literal("range"),
    minINR: z.number().min(0),
    maxINR: z.number().min(0),
    recurrence,
    sourceRef: idSchema,
    note: note.optional(),
  }),
  z.strictObject({
    kind: z.literal("variable"),
    note: z.string().min(3).max(300),
    recurrence: recurrence.optional(),
    sourceRef: idSchema.optional(),
  }),
  z.strictObject({ kind: z.literal("unknown"), note: note.optional() }),
]);

export const durationSchema = z.strictObject({
  minDays: z.int().min(0).max(730),
  maxDays: z.int().min(0).max(730),
  dayType: z.enum(["working", "calendar"]),
});

export const timelineSchema = z.strictObject({
  officialSla: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("sla"), duration: durationSchema, sourceRef: idSchema, wording: note.optional() }),
    z.strictObject({ kind: z.literal("no_fixed_sla"), note: z.string().min(3).max(300), sourceRef: idSchema.optional() }),
    z.strictObject({ kind: z.literal("unknown"), note: note.optional() }),
  ]),
  conditional: z
    .array(
      z.strictObject({
        condition: z.string().min(3).max(200),
        rule: ruleSchema.optional(),
        duration: z.discriminatedUnion("kind", [
          z.strictObject({ kind: z.literal("range"), ...durationSchema.shape }),
          z.strictObject({ kind: z.literal("open_ended"), note: z.string().min(3).max(200) }),
        ]),
        sourceRef: idSchema,
      }),
    )
    .max(10),
});

export const reviewSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("unverified"), note: z.string().max(500).optional() }),
  z.strictObject({ status: z.literal("verified"), verifiedOn: isoDate, note: z.string().max(500).optional() }),
  z.strictObject({ status: z.literal("flagged"), note: z.string().min(3).max(500) }),
]);

// ── Steps ──
export const requirementSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("mandatory") }),
  z.strictObject({ kind: z.literal("conditional"), condition: z.string().min(3).max(300), rule: ruleSchema.optional() }),
  z.strictObject({ kind: z.literal("optional"), note: note.optional() }),
]);

export const OFFICE_TYPES = [
  "online_portal",
  "municipal_hq",
  "ward_office",
  "fire_services",
  "health_department",
  "revenue_office",
  "labour_department",
  "police",
  "pollution_control_board",
  "utility_provider",
  "court_or_notary",
  "other",
] as const;
export const officeTypeSchema = z.enum(OFFICE_TYPES);

const documentSchema = z.strictObject({
  documentTypeId: idSchema,
  name: z.string().min(2).max(160),
  perPerson: z.strictObject({ fact: factKeySchema, label: z.string().min(2).max(40) }).optional(),
  acceptedFormats: z.array(z.string().min(2).max(40)).max(10).optional(),
  maxSizeKB: z.int().min(1).max(102400).optional(),
  note: note.optional(),
});
const outputSchema = z.strictObject({ documentTypeId: idSchema, name: z.string().min(2).max(120) });

const commonStepShape = {
  id: idSchema,
  title: z.string().min(3).max(80),
  description: z.string().max(600),
  requirement: requirementSchema,
};
const actionStepShape = {
  ...commonStepShape,
  department: z.string().min(2).max(120),
  mode: z.enum(["online", "in_person", "hybrid"]),
  officeType: officeTypeSchema,
  office: z
    .strictObject({
      name: z.string().min(2).max(160),
      address: z.string().max(300).optional(),
      ward: z.string().max(60).optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      hours: z.string().max(120).optional(),
    })
    .optional(),
  applicationPortal: z.strictObject({ name: z.string().min(2).max(120), url: httpsUrl }).optional(),
  forms: z.array(z.strictObject({ name: z.string().min(2).max(160), code: z.string().max(40).optional(), url: httpsUrl.optional() })).max(20),
  documents: z.array(documentSchema).max(40),
  outputs: z.array(outputSchema).max(10),
  fee: feeSchema,
  timeline: timelineSchema,
  repeat: z.strictObject({ fact: factKeySchema, label: z.string().min(2).max(40), max: z.int().min(1).max(10) }).optional(),
  sourceIds: z.array(idSchema).max(10),
  review: reviewSchema,
};

export const stepSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("government"), authoritySlug: idSchema, ...actionStepShape }),
  z.strictObject({ kind: z.literal("non_government"), ...actionStepShape }),
  z.strictObject({ kind: z.literal("milestone"), ...commonStepShape }),
]);

export const edgeSchema = z.strictObject({
  id: idSchema,
  from: idSchema,
  to: idSchema,
  kind: z.enum(["requires", "recommended_after"]),
  note: z.string().max(200).optional(),
  via: idSchema.optional(),
});

const metaSchema = z.strictObject({
  origin: z.enum(["curated", "extracted", "ai_generated"]),
  updatedAt: z.iso.datetime({ offset: true }),
});

// ── Authoring documents (stored as JSONB, one row per version / revision) ──
export const approvalModuleSchema = z.strictObject({
  schemaVersion: z.literal(3),
  moduleId: idSchema,
  version: z.int().min(1),
  title: z.string().min(3).max(120),
  summary: z.string().max(600),
  authority: z.strictObject({
    slug: idSchema,
    name: z.string().min(2).max(160),
    tier: z.enum(["central", "state", "municipal", "other"]),
    officialUrl: httpsUrl,
  }),
  eligibility: z.array(z.strictObject({ text: z.string().min(3).max(300), rule: ruleSchema.optional(), sourceRef: idSchema.optional() })).max(20),
  sources: z.array(sourceSchema).max(30),
  steps: z.array(stepSchema).min(1).max(20),
  edges: z.array(edgeSchema).max(60),
  entrySteps: z.array(idSchema).min(1).max(20),
  exitSteps: z.array(idSchema).min(1).max(20),
  meta: metaSchema,
});

export const CATEGORIES = [
  "business_and_trade",
  "food_and_hospitality",
  "property_and_tax",
  "building_and_construction",
  "utilities",
  "certificates_and_records",
  "transport_and_vehicles",
  "other",
] as const;

export const questionSchema = z.strictObject({
  fact: factKeySchema,
  text: z.string().min(5).max(200),
  help: z.string().max(300).optional(),
  options: z.array(z.strictObject({ value: factValueSchema, label: z.string().min(1).max(80) })).min(2).max(20).optional(),
});

export const journeyTemplateSchema = z.strictObject({
  schemaVersion: z.literal(3),
  taskId: idSchema,
  revision: z.int().min(1),
  title: z.string().min(3).max(120),
  summary: z.string().max(600),
  jurisdiction: z.strictObject({
    country: z.literal("IN"),
    state: z.string().min(2).max(60),
    city: z.string().min(2).max(60).optional(),
    localBody: z.string().max(120).optional(),
    ward: z.string().max(60).optional(),
  }),
  category: z.enum(CATEGORIES),
  keywords: z
    .array(z.string().min(2).max(60))
    .max(30)
    .refine((k) => new Set(k).size === k.length, "duplicate keyword"),
  sources: z.array(sourceSchema).max(30),
  questions: z.array(questionSchema).max(20),
  modules: z
    .array(
      z.strictObject({
        moduleId: idSchema,
        version: z.int().min(1),
        requirement: z.enum(["mandatory", "conditional", "optional"]),
        activation: ruleSchema.nullable(),
        reason: z.string().min(3).max(200),
      }),
    )
    .min(1)
    .max(30),
  links: z
    .array(
      z.strictObject({
        id: idSchema,
        fromModule: idSchema,
        toModule: idSchema,
        kind: z.enum(["requires", "recommended_after"]),
        note: z.string().max(200).optional(),
        via: idSchema.optional(),
      }),
    )
    .max(80),
  meta: metaSchema,
});

export type Source = z.infer<typeof sourceSchema>;
export type Fee = z.infer<typeof feeSchema>;
export type Duration = z.infer<typeof durationSchema>;
export type Timeline = z.infer<typeof timelineSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export type OfficeType = z.infer<typeof officeTypeSchema>;
export type Step = z.infer<typeof stepSchema>;
export type ActionStep = Exclude<Step, { kind: "milestone" }>;
export type Edge = z.infer<typeof edgeSchema>;
export type ApprovalModule = z.infer<typeof approvalModuleSchema>;
export type Question = z.infer<typeof questionSchema>;
export type JourneyTemplate = z.infer<typeof journeyTemplateSchema>;
export type Category = (typeof CATEGORIES)[number];
