import type { NextRequest } from "next/server";
import { copilotRequestSchema, copilotResponseSchema } from "@/lib/contract/api";
import { composeJourney, type ComposedStep } from "@/lib/contract/compose";
import { isOfficialUrl } from "@/lib/contract/officialSources";
import { jsonError, jsonOk, requestId } from "@/lib/server/http";
import { copilotViaIntelligence, type IntelligenceCopilotReply } from "@/lib/server/intelligence";
import { getJourneyRepository } from "@/lib/server/journeys";
import { clientIp, consume, ipHash } from "@/lib/server/rateLimit";

type CopilotResponse = ReturnType<typeof copilotResponseSchema.parse>;

interface Scope {
  jurisdiction: { state: string; city?: string } | undefined;
  scopeUrls: string[];
  stepTitle: string | undefined;
}

const isActionStep = (step: ComposedStep): step is Extract<ComposedStep, { sources: unknown }> => step.kind !== "milestone";

/**
 * The copilot answers about one journey (§5 F10), so retrieval is scoped to that journey's official
 * sources. Composing maximally means a question about a step the citizen has not switched on is still
 * answerable. A stepId narrows the scope to that step's own sources.
 */
async function buildScope(taskId: string | undefined, stepId: string | undefined): Promise<Scope | "not_found"> {
  if (taskId === undefined) return { jurisdiction: undefined, scopeUrls: [], stepTitle: undefined };

  const journey = await getJourneyRepository().getPublishedJourney(taskId);
  if (journey === null) return "not_found";

  const composed = composeJourney(journey.template, journey.modules, {}, { maximal: true });
  const steps = composed.steps.filter(isActionStep);
  const selected = stepId === undefined ? undefined : steps.find((step) => step.id === stepId);
  const inScope = selected === undefined ? steps : [selected];

  const { state, city } = journey.template.jurisdiction;
  return {
    jurisdiction: city === undefined ? { state } : { state, city },
    scopeUrls: [...new Set(inScope.flatMap((step) => step.sources.map((source) => source.url)))],
    stepTitle: selected?.title,
  };
}

/**
 * Officialness is decided here, never by the AI service (§13.1): a mislabelled citation must not be
 * able to show a citizen a trusted badge.
 */
function toCitations(reply: IntelligenceCopilotReply): CopilotResponse["citations"] {
  return reply.citations.map((citation) => ({
    n: citation.n,
    url: citation.url,
    title: citation.title,
    quote: citation.quote,
    chunkId: citation.chunkId,
    official: isOfficialUrl(citation.url),
  }));
}

/** POST /api/v1/copilot — a cited answer from official sources, or an honest refusal (§7.3, §10.1). */
export async function POST(request: NextRequest): Promise<Response> {
  const id = requestId(request);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("invalid_json", "The request body is not valid JSON.", 400, { requestId: id });
  }

  const parsed = copilotRequestSchema.safeParse(raw);
  if (!parsed.success) {
    // The question is never echoed back or logged (§12.1).
    return jsonError("invalid_request", "The copilot request is not valid.", 400, {
      requestId: id,
      details: { fields: [...new Set(parsed.error.issues.map((issue) => issue.path.map(String).join(".")))] },
    });
  }

  const limit = consume("copilot", ipHash(clientIp(request)));
  if (!limit.ok) {
    return jsonError("rate_limited", "Too many questions. Try again in a minute.", 429, {
      requestId: id,
      headers: { "retry-after": String(limit.retryAfterSeconds) },
    });
  }

  const { question, taskId, stepId, locale } = parsed.data;

  let scope: Scope | "not_found";
  try {
    scope = await buildScope(taskId, stepId);
  } catch (error) {
    console.error(`[${id}] copilot: could not build the scope:`, error);
    return jsonError("internal", "The assistant is unavailable right now.", 500, { requestId: id });
  }
  if (scope === "not_found") {
    return jsonError("not_found", "No published journey has that id.", 404, { requestId: id });
  }

  const reply = await copilotViaIntelligence({
    question,
    locale,
    jurisdiction: scope.jurisdiction,
    scopeUrls: scope.scopeUrls.length === 0 ? undefined : scope.scopeUrls,
    stepTitle: scope.stepTitle,
  });

  if (reply === null) {
    return jsonError("upstream_unavailable", "The assistant is unavailable right now.", 503, { requestId: id });
  }

  const citations = toCitations(reply);
  // An answer without citations is not an answer (§13.1, §7.3). Rather than show unsourced prose, say
  // it was not found and hand over the passages, which is what the panel renders anyway.
  const unsourced = reply.answer !== null && citations.length === 0;

  const body: CopilotResponse = copilotResponseSchema.parse({
    requestId: id,
    answer: unsourced ? null : reply.answer,
    language: reply.language,
    citations,
    ...(unsourced ? { notice: "not_found" as const } : reply.notice === undefined ? {} : { notice: reply.notice }),
    ...(reply.passages === undefined ? {} : { passages: reply.passages }),
  });
  return jsonOk(body, { requestId: id });
}
