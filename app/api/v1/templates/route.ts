import type { NextRequest } from "next/server";
import { z } from "zod";
import { templateListResponseSchema } from "@/lib/contract/api";
import { jsonError, jsonOk, requestId } from "@/lib/server/http";
import { getJourneyRepository } from "@/lib/server/journeys";

// Unknown query parameters are ignored on purpose: a CDN or a link tracker may add its own.
const querySchema = z.object({
  q: z.string().trim().min(1).max(300).optional(),
  city: z.string().trim().min(1).max(120).optional(),
});

/** GET /api/v1/templates?q=&city= — published journey summaries (§10.1). */
export async function GET(request: NextRequest): Promise<Response> {
  const id = requestId(request);
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    q: params.get("q") ?? undefined,
    city: params.get("city") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError("invalid_request", "q must be 1-300 characters and city 1-120.", 400, { requestId: id });
  }

  try {
    const templates = await getJourneyRepository().listTemplates(parsed.data);
    return jsonOk(templateListResponseSchema.parse({ templates }), { requestId: id });
  } catch (error) {
    console.error(`[${id}] GET /api/v1/templates failed:`, error);
    return jsonError("internal", "Could not list journeys.", 500, { requestId: id });
  }
}
