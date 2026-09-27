import "server-only";
import { z } from "zod";
import type { TemplateSummary } from "@/lib/contract/api";
import { factKeySchema, factValueSchema } from "@/lib/contract/facts";
import { serviceAuthorizationHeader } from "./serviceToken";

/** §6.6: search must answer within 6 s or fall back to lexical ranking. */
const SEARCH_TIMEOUT_MS = 6_000;
/**
 * §6.6: the intelligence service being "down or > 6 s" is what turns the copilot into a 503. The
 * 15 s in §7.2 is the AI service's own per-call budget for an LLM provider, not this hop.
 */
const COPILOT_TIMEOUT_MS = 6_000;
/** A health probe must never hold up the health endpoint. */
const HEALTH_TIMEOUT_MS = 2_000;

/**
 * The /v1/search reply (Appendix F.3). The service returns taskId and score only; the BFF attaches the
 * summaries, mode and requestId. Extra fields are tolerated so a newer AI service does not break search,
 * but a wrong shape is logged rather than passed on.
 */
const searchReplySchema = z.object({
  facts: z
    .array(z.object({ fact: factKeySchema, value: factValueSchema, evidence: z.string().max(200) }))
    .max(15),
  jurisdiction: z.object({ state: z.string(), city: z.string().optional(), matchedText: z.string() }).nullable(),
  matches: z.array(z.object({ taskId: z.string(), score: z.number().min(0).max(1) })).max(20),
  clarifications: z
    .array(
      z.object({
        kind: z.enum(["location", "task"]),
        text: z.string(),
        options: z.array(z.object({ label: z.string(), value: z.string() })).max(6),
      }),
    )
    .max(2),
  notice: z.enum(["no_match", "location_required", "out_of_scope"]).optional(),
});

export type IntelligenceSearchReply = z.infer<typeof searchReplySchema>;

export interface IntelligenceSearchRequest {
  query: string;
  location?: string | undefined;
  category?: string | undefined;
  locale: "en" | "hi" | "mr";
  candidates: readonly TemplateSummary[];
}

/**
 * Calls the intelligence service. Returns null for every failure — unset URL, timeout, non-200, or a
 * reply that does not match F.3 — so the caller always has one thing to check before falling back (§6.6).
 * The query is never logged (§12.1).
 */
export async function searchViaIntelligence(input: IntelligenceSearchRequest): Promise<IntelligenceSearchReply | null> {
  const baseUrl = process.env["INTELLIGENCE_BASE_URL"];
  if (baseUrl === undefined || baseUrl.length === 0) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/search`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: serviceAuthorizationHeader() },
      body: JSON.stringify(input),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(`intelligence: /v1/search returned ${response.status}`);
      return null;
    }

    const parsed = searchReplySchema.safeParse(await response.json());
    if (!parsed.success) {
      console.error(
        `intelligence: /v1/search reply does not match F.3 at ${parsed.error.issues.map((i) => i.path.map(String).join(".")).join(", ")}`,
      );
      return null;
    }
    return parsed.data;
  } catch (error) {
    console.error("intelligence: /v1/search unavailable:", error instanceof Error ? error.message : String(error));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The /v1/copilot reply (Appendix F.3, same shapes as F.1).
 *
 * `official` is deliberately NOT taken from the service: whether a source is official is decided here
 * by isOfficialUrl(), so a mislabelled citation can never show a citizen a trusted badge (§13.1).
 */
const copilotReplySchema = z.object({
  answer: z.string().max(4000).nullable(),
  language: z.enum(["en", "hi", "mr"]),
  citations: z
    .array(
      z.object({
        n: z.int().min(1),
        url: z.url(),
        title: z.string(),
        quote: z.string().max(500),
        chunkId: z.uuid(),
        official: z.boolean().optional(),
      }),
    )
    .max(8),
  notice: z.enum(["not_found", "out_of_scope", "degraded"]).optional(),
  passages: z.array(z.object({ url: z.url(), title: z.string(), text: z.string().max(1200) })).max(3).optional(),
});

export type IntelligenceCopilotReply = z.infer<typeof copilotReplySchema>;

export interface IntelligenceCopilotRequest {
  question: string;
  locale: "en" | "hi" | "mr";
  jurisdiction?: { state: string; city?: string } | undefined;
  scopeUrls?: string[] | undefined;
  stepTitle?: string | undefined;
}

/** Returns null for every failure, so the route answers 503 rather than guessing (§6.6). */
export async function copilotViaIntelligence(
  input: IntelligenceCopilotRequest,
): Promise<IntelligenceCopilotReply | null> {
  const baseUrl = process.env["INTELLIGENCE_BASE_URL"];
  if (baseUrl === undefined || baseUrl.length === 0) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COPILOT_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/copilot`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: serviceAuthorizationHeader() },
      body: JSON.stringify(input),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(`intelligence: /v1/copilot returned ${response.status}`);
      return null;
    }

    const parsed = copilotReplySchema.safeParse(await response.json());
    if (!parsed.success) {
      console.error(
        `intelligence: /v1/copilot reply does not match F.3 at ${parsed.error.issues.map((i) => i.path.map(String).join(".")).join(", ")}`,
      );
      return null;
    }
    return parsed.data;
  } catch (error) {
    console.error("intelligence: /v1/copilot unavailable:", error instanceof Error ? error.message : String(error));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** GET /health on the AI service, for our own /api/v1/health (§10.1). */
export async function intelligenceHealth(): Promise<"up" | "down" | "skipped"> {
  const baseUrl = process.env["INTELLIGENCE_BASE_URL"];
  if (baseUrl === undefined || baseUrl.length === 0) return "skipped";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, { signal: controller.signal, cache: "no-store" });
    return response.ok ? "up" : "down";
  } catch {
    return "down";
  } finally {
    clearTimeout(timer);
  }
}
