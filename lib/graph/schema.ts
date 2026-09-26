import { z } from "zod";

export const idSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const httpsUrlSchema = z.url({ protocol: /^https$/ }).max(2048);

export const isoDateSchema = z.iso.date();

export const noteSchema = z.string().max(300);

export const jurisdictionSchema = z.strictObject({
  country: z.literal("IN"),
  state: z.string().min(2).max(60),
  city: z.string().min(2).max(60),
  localBody: z.string().max(120).optional(),
  ward: z.string().max(60).optional(),
});

export const officeSchema = z.strictObject({
  name: z.string().min(2).max(160),
  address: z.string().max(300).optional(),
  ward: z.string().max(60).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  hours: z.string().max(120).optional(),
});

export const formSchema = z.strictObject({
  name: z.string().min(2).max(160),
  code: z.string().max(40).optional(),
  url: httpsUrlSchema.optional(),
});

export const documentSchema = z.strictObject({
  name: z.string().min(2).max(160),
  acceptedFormats: z.array(z.string().min(2).max(40)).max(10).optional(),
  maxSizeKB: z.int().min(1).max(102400).optional(),
  note: noteSchema.optional(),
});

export const recurrenceSchema = z.enum(["one_time", "annual"]);

export const feeSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("free"),
    note: noteSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("fixed"),
    amountINR: z.number().min(0),
    recurrence: recurrenceSchema,
    note: noteSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("range"),
    minINR: z.number().min(0),
    maxINR: z.number().min(0),
    recurrence: recurrenceSchema,
    note: noteSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("variable"),
    recurrence: recurrenceSchema.optional(),
    note: z.string().min(3).max(300),
  }),
  z.strictObject({
    kind: z.literal("unknown"),
    note: noteSchema.optional(),
  }),
]);

export const durationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("estimate"),
    minDays: z.int().min(0).max(365),
    maxDays: z.int().min(0).max(365),
    dayType: z.enum(["working", "calendar"]),
    note: noteSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("unknown"),
    note: noteSchema.optional(),
  }),
]);

export const sourceSchema = z.strictObject({
  url: httpsUrlSchema,
  title: z.string().min(2).max(160),
  kind: z.enum([
    "portal",
    "form",
    "guideline",
    "fee_schedule",
    "act_or_rule",
    "faq",
    "other",
  ]),
  retrievedOn: isoDateSchema,
});

export const reviewSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("unverified"),
    note: z.string().max(500).optional(),
  }),
  z.strictObject({
    status: z.literal("verified"),
    verifiedOn: isoDateSchema,
    note: z.string().max(500).optional(),
  }),
  z.strictObject({
    status: z.literal("flagged"),
    note: z.string().min(3).max(500),
  }),
]);

export const requirementSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("mandatory"),
  }),
  z.strictObject({
    kind: z.literal("conditional"),
    condition: z.string().min(3).max(300),
  }),
  z.strictObject({
    kind: z.literal("optional"),
    note: noteSchema.optional(),
  }),
]);

export const stepSchema = z.strictObject({
  id: idSchema,
  title: z.string().min(3).max(80),
  description: z.string().max(600),
  department: z.string().min(2).max(120),
  requirement: requirementSchema,
  mode: z.enum(["online", "in_person", "hybrid"]),
  officeType: z.enum([
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
  ]),
  office: officeSchema.optional(),
  forms: z.array(formSchema).max(20),
  documents: z.array(documentSchema).max(40),
  fee: feeSchema,
  processingTime: durationSchema,
  sources: z.array(sourceSchema).max(10),
  review: reviewSchema,
});

export const edgeSchema = z.strictObject({
  id: idSchema,
  from: idSchema,
  to: idSchema,
  note: z.string().max(200).optional(),
});

export const metaSchema = z.strictObject({
  origin: z.enum(["curated", "extracted", "ai_generated"]),
  revision: z.int().min(1),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const categorySchema = z.enum([
  "business_and_trade",
  "food_and_hospitality",
  "property_and_tax",
  "building_and_construction",
  "utilities",
  "certificates_and_records",
  "transport_and_vehicles",
  "other",
]);

export const civicTaskGraphSchema = z.strictObject({
  schemaVersion: z.literal(1),
  taskId: idSchema,
  title: z.string().min(3).max(120),
  summary: z.string().max(600),
  jurisdiction: jurisdictionSchema,
  category: categorySchema,
  keywords: z
    .array(z.string().min(2).max(60))
    .max(30)
    .refine((items) => new Set(items).size === items.length, {
      message: "keywords must be unique",
    }),
  eligibility: z.array(z.string().min(3).max(300)).max(20),
  nodes: z.array(stepSchema).min(1).max(40),
  edges: z.array(edgeSchema).max(120),
  meta: metaSchema,
});

export type CivicTaskGraph = z.infer<typeof civicTaskGraphSchema>;
export type Step = z.infer<typeof stepSchema>;
export type Edge = z.infer<typeof edgeSchema>;
export type Fee = z.infer<typeof feeSchema>;
export type Duration = z.infer<typeof durationSchema>;
