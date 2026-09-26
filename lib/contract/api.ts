import { z } from "zod";
import { factKeySchema, factValueSchema } from "./facts";
import { CATEGORIES, approvalModuleSchema, idSchema, journeyTemplateSchema } from "./schema";

export const localeSchema = z.enum(["en", "hi", "mr"]);
const composedStepId = z.string().min(3).max(140).regex(/^[a-z0-9-]+\.[a-z0-9-]+(?:\.(?:[1-9]|10))?$/);

export const ERROR_CODES = [
  "invalid_json",
  "invalid_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "invalid_graph",
  "rate_limited",
  "upstream_unavailable",
  "internal",
] as const;
export const errorBodySchema = z.strictObject({
  error: z.strictObject({ code: z.enum(ERROR_CODES), message: z.string().max(300), details: z.unknown().optional() }),
  requestId: z.string(),
});

export const templateSummarySchema = z.strictObject({
  taskId: idSchema,
  revision: z.int().min(1),
  title: z.string(),
  summary: z.string(),
  category: z.enum(CATEGORIES),
  jurisdiction: z.strictObject({ state: z.string(), city: z.string().optional() }),
  keywords: z.array(z.string()),
  questionFacts: z.array(factKeySchema),
  stepCount: z.int().min(0),
  verifiedStepCount: z.int().min(0),
});

// POST /api/v1/search
export const searchRequestSchema = z.strictObject({
  query: z.string().trim().min(3).max(300),
  location: z.string().trim().max(120).optional(),
  category: z.enum(CATEGORIES).optional(),
  locale: localeSchema.default("en"),
});
export const searchResponseSchema = z.strictObject({
  requestId: z.string(),
  mode: z.enum(["ai", "lexical_fallback"]),
  facts: z.array(z.strictObject({ fact: factKeySchema, value: factValueSchema, evidence: z.string().max(200) })).max(15),
  jurisdiction: z.strictObject({ state: z.string(), city: z.string().optional(), matchedText: z.string() }).nullable(),
  matches: z.array(templateSummarySchema.extend({ score: z.number().min(0).max(1) })).max(8),
  clarifications: z
    .array(
      z.strictObject({
        kind: z.enum(["location", "task"]),
        text: z.string(),
        options: z.array(z.strictObject({ label: z.string(), value: z.string() })).max(6),
      }),
    )
    .max(2),
  notice: z.enum(["no_match", "location_required", "out_of_scope"]).optional(),
});

// GET /api/v1/templates?q=&city=
export const templateListResponseSchema = z.strictObject({ templates: z.array(templateSummarySchema) });

// GET /api/v1/templates/{taskId}
export const publishedJourneyResponseSchema = z.strictObject({
  template: journeyTemplateSchema,
  modules: z.array(approvalModuleSchema),
  publishedAt: z.iso.datetime({ offset: true }),
});

// POST /api/v1/copilot
export const copilotRequestSchema = z.strictObject({
  question: z.string().trim().min(3).max(500),
  taskId: idSchema.optional(),
  stepId: composedStepId.optional(),
  locale: localeSchema.default("en"),
});
export const copilotResponseSchema = z.strictObject({
  requestId: z.string(),
  answer: z.string().max(4000).nullable(),
  language: localeSchema,
  citations: z
    .array(
      z.strictObject({
        n: z.int().min(1),
        url: z.url(),
        title: z.string(),
        quote: z.string().max(500),
        chunkId: z.uuid(),
        official: z.boolean(),
      }),
    )
    .max(8),
  notice: z.enum(["not_found", "out_of_scope", "degraded"]).optional(),
  passages: z.array(z.strictObject({ url: z.url(), title: z.string(), text: z.string().max(1200) })).max(3).optional(),
});

// POST /api/v1/feedback
export const feedbackRequestSchema = z.strictObject({
  kind: z.enum(["wrong_fee", "wrong_document", "broken_link", "outdated", "wrong_order", "request", "copilot_error", "other"]),
  taskId: idSchema.optional(),
  stepId: composedStepId.optional(),
  revision: z.int().min(1).optional(),
  message: z.string().trim().max(1000).optional(),
});

// GET /api/v1/health
export const healthResponseSchema = z.strictObject({
  ok: z.boolean(),
  version: z.string(),
  dataSource: z.enum(["files", "db", "fixtures"]),
  db: z.enum(["up", "down", "skipped"]),
  intelligence: z.enum(["up", "down", "skipped"]),
});

// Admin
export const saveDraftRequestSchema = z.strictObject({
  content: approvalModuleSchema,
  baseHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export const publishRequestSchema = z.strictObject({ expectedRevision: z.int().min(1) });

export type SearchRequest = z.input<typeof searchRequestSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
export type TemplateSummary = z.infer<typeof templateSummarySchema>;
export type PublishedJourneyResponse = z.infer<typeof publishedJourneyResponseSchema>;
export type CopilotRequest = z.input<typeof copilotRequestSchema>;
export type CopilotResponse = z.infer<typeof copilotResponseSchema>;
