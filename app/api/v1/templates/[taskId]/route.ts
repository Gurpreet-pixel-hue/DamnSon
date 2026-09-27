import type { NextRequest } from "next/server";
import { publishedJourneyResponseSchema } from "@/lib/contract/api";
import { idSchema } from "@/lib/contract/schema";
import { jsonError, jsonOk, requestId } from "@/lib/server/http";
import { getJourneyRepository } from "@/lib/server/journeys";

/** GET /api/v1/templates/{taskId} — the published template and exactly its pinned modules (§10.1). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/v1/templates/[taskId]">): Promise<Response> {
  const id = requestId(request);
  const { taskId } = await ctx.params;

  const parsed = idSchema.safeParse(taskId);
  if (!parsed.success) {
    return jsonError("invalid_request", "taskId must be a lower-case, hyphenated id.", 400, { requestId: id });
  }

  try {
    const journey = await getJourneyRepository().getPublishedJourney(parsed.data);
    if (journey === null) {
      return jsonError("not_found", "No published journey has that id.", 404, { requestId: id });
    }
    return jsonOk(publishedJourneyResponseSchema.parse(journey), { requestId: id });
  } catch (error) {
    console.error(`[${id}] GET /api/v1/templates/${parsed.data} failed:`, error);
    return jsonError("internal", "Could not load that journey.", 500, { requestId: id });
  }
}
