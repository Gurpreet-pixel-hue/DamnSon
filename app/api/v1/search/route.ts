import type { NextRequest } from "next/server";
import { searchRequestSchema, searchResponseSchema, type TemplateSummary } from "@/lib/contract/api";
import { parseFacts } from "@/lib/contract/facts";
import { jsonError, jsonOk, requestId } from "@/lib/server/http";
import { searchViaIntelligence, type IntelligenceSearchReply } from "@/lib/server/intelligence";
import { getJourneyRepository } from "@/lib/server/journeys";
import { rankTemplates } from "@/lib/server/journeys/search";
import { clientIp, consume, ipHash } from "@/lib/server/rateLimit";

type SearchResponse = ReturnType<typeof searchResponseSchema.parse>;
type Match = SearchResponse["matches"][number];

/**
 * Only templates we actually publish can be returned, whatever the model says: an unknown taskId would
 * become a dead link, and a hallucinated one must not reach a citizen (§12.1).
 */
function attachSummaries(reply: IntelligenceSearchReply, candidates: readonly TemplateSummary[]): Match[] {
  const byTaskId = new Map(candidates.map((candidate) => [candidate.taskId, candidate]));
  return reply.matches
    .flatMap((match) => {
      const summary = byTaskId.get(match.taskId);
      return summary === undefined ? [] : [{ ...summary, score: match.score }];
    })
    .slice(0, 8);
}

/** Facts go through the registry (F.3): an invalid value from the model is dropped, not shown. */
function cleanFacts(reply: IntelligenceSearchReply): SearchResponse["facts"] {
  const firstMention = new Map<string, IntelligenceSearchReply["facts"][number]>();
  for (const fact of reply.facts) {
    if (!firstMention.has(fact.fact)) firstMention.set(fact.fact, fact);
  }
  const valid = parseFacts(Object.fromEntries([...firstMention].map(([key, fact]) => [key, fact.value])));
  return [...firstMention.values()].filter((fact) => valid[fact.fact] !== undefined);
}

/** POST /api/v1/search — facts, jurisdiction and ranked matches, with a lexical fallback (§6.6, §10.1). */
export async function POST(request: NextRequest): Promise<Response> {
  const id = requestId(request);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("invalid_json", "The request body is not valid JSON.", 400, { requestId: id });
  }

  const parsed = searchRequestSchema.safeParse(raw);
  if (!parsed.success) {
    // Field paths only: the query itself is never echoed or logged (§12.1).
    return jsonError("invalid_request", "The search request is not valid.", 400, {
      requestId: id,
      details: { fields: [...new Set(parsed.error.issues.map((issue) => issue.path.map(String).join(".")))] },
    });
  }

  const limit = consume("search", ipHash(clientIp(request)));
  if (!limit.ok) {
    return jsonError("rate_limited", "Too many searches. Try again in a minute.", 429, {
      requestId: id,
      headers: { "retry-after": String(limit.retryAfterSeconds) },
    });
  }

  const { query, location, category, locale } = parsed.data;

  let candidates: TemplateSummary[];
  try {
    candidates = await getJourneyRepository().listTemplates();
  } catch (error) {
    console.error(`[${id}] search: could not list candidates:`, error);
    return jsonError("internal", "Search is unavailable right now.", 500, { requestId: id });
  }

  const reply = await searchViaIntelligence({ query, location, category, locale, candidates });

  if (reply !== null) {
    const matches = attachSummaries(reply, candidates);
    const body: SearchResponse = searchResponseSchema.parse({
      requestId: id,
      mode: "ai",
      facts: cleanFacts(reply),
      jurisdiction: reply.jurisdiction,
      matches,
      clarifications: reply.clarifications,
      // The service may have judged a match that we then dropped as unpublished; say so honestly.
      ...(reply.notice === undefined ? (matches.length === 0 ? { notice: "no_match" as const } : {}) : { notice: reply.notice }),
    });
    return jsonOk(body, { requestId: id });
  }

  // Lexical fallback: titles and keywords only, so no facts and no jurisdiction can be claimed (§6.6).
  const ranked = rankTemplates(candidates, query);
  const body: SearchResponse = searchResponseSchema.parse({
    requestId: id,
    mode: "lexical_fallback",
    facts: [],
    jurisdiction: null,
    matches: ranked.map((entry) => ({ ...entry.template, score: entry.score })),
    clarifications: [],
    ...(ranked.length === 0 ? { notice: "no_match" as const } : {}),
  });
  return jsonOk(body, { requestId: id });
}
