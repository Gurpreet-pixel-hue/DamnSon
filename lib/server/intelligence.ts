import "server-only";
import { z } from "zod";
import type { TemplateSummary } from "@/lib/contract/api";
import { factKeySchema, factValueSchema } from "@/lib/contract/facts";
import { serviceAuthorizationHeader } from "./serviceToken";

/** §6.6: search must answer within 6 s or fall back to lexical ranking. */
const SEARCH_TIMEOUT_MS = 6_000;

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
