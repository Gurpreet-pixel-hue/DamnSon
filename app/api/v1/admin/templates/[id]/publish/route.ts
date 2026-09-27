import type { NextRequest } from "next/server";
import { publishRequestSchema } from "@/lib/contract/api";
import { idSchema } from "@/lib/contract/schema";
import { publishTemplate } from "@/lib/server/admin/publish";
import { adminErrorResponse } from "@/lib/server/admin/types";
import { ADMIN_HEADERS, requireAdmin } from "@/lib/server/auth";
import { jsonError, jsonOk, readJsonBody, requestId } from "@/lib/server/http";

/** POST /api/v1/admin/templates/{id}/publish — the human gate before anything reaches a citizen (§6.4). */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/v1/admin/templates/[id]/publish">): Promise<Response> {
  const requestIdValue = requestId(request);
  const guard = await requireAdmin(requestIdValue);
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const routeId = idSchema.safeParse(id);
  if (!routeId.success) {
    return jsonError("invalid_request", "taskId must be a lower-case, hyphenated id.", 400, {
      requestId: requestIdValue,
      headers: ADMIN_HEADERS,
    });
  }

  const incoming = await readJsonBody(request, { requestId: requestIdValue, headers: ADMIN_HEADERS });
  if (!incoming.ok) return incoming.response;
  const raw = incoming.value;

  const parsed = publishRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("invalid_request", "expectedRevision is required.", 400, {
      requestId: requestIdValue,
      headers: ADMIN_HEADERS,
    });
  }

  try {
    const result = await publishTemplate(routeId.data, parsed.data.expectedRevision, guard.userId);
    if (!result.ok) return adminErrorResponse(result, requestIdValue);
    return jsonOk(result.value, { requestId: requestIdValue, headers: ADMIN_HEADERS });
  } catch (error) {
    console.error(`[${requestIdValue}] admin: publish failed:`, error);
    return jsonError("internal", "Could not publish that template.", 500, { requestId: requestIdValue, headers: ADMIN_HEADERS });
  }
}
