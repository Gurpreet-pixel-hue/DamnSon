import type { NextRequest } from "next/server";
import { saveDraftRequestSchema } from "@/lib/contract/api";
import { idSchema } from "@/lib/contract/schema";
import { saveDraft } from "@/lib/server/admin/modules";
import { adminErrorResponse } from "@/lib/server/admin/types";
import { ADMIN_HEADERS, requireAdmin } from "@/lib/server/auth";
import { jsonError, jsonOk, requestId } from "@/lib/server/http";

/** PUT /api/v1/admin/modules/{id}/draft — save the whole module as its draft (F.2, §10.1). */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/v1/admin/modules/[id]/draft">): Promise<Response> {
  const requestIdValue = requestId(request);
  const guard = await requireAdmin(requestIdValue);
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const routeId = idSchema.safeParse(id);
  if (!routeId.success) {
    return jsonError("invalid_request", "moduleId must be a lower-case, hyphenated id.", 400, {
      requestId: requestIdValue,
      headers: ADMIN_HEADERS,
    });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("invalid_json", "The request body is not valid JSON.", 400, {
      requestId: requestIdValue,
      headers: ADMIN_HEADERS,
    });
  }

  const parsed = saveDraftRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("invalid_request", "The draft is not a valid module.", 400, {
      requestId: requestIdValue,
      headers: ADMIN_HEADERS,
      details: { fields: [...new Set(parsed.error.issues.map((issue) => issue.path.map(String).join(".")))] },
    });
  }

  // Saving module A's content under module B's URL would silently move a whole procedure.
  if (parsed.data.content.moduleId !== routeId.data) {
    return jsonError("invalid_request", "The module id in the body does not match the URL.", 400, {
      requestId: requestIdValue,
      headers: ADMIN_HEADERS,
    });
  }

  try {
    const result = await saveDraft(routeId.data, parsed.data.content, parsed.data.baseHash, guard.userId);
    if (!result.ok) return adminErrorResponse(result, requestIdValue);
    return jsonOk(result.value, { requestId: requestIdValue, headers: ADMIN_HEADERS });
  } catch (error) {
    console.error(`[${requestIdValue}] admin: saving draft failed:`, error);
    return jsonError("internal", "Could not save the draft.", 500, { requestId: requestIdValue, headers: ADMIN_HEADERS });
  }
}
