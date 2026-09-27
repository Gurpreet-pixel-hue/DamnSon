import type { NextRequest } from "next/server";
import { idSchema } from "@/lib/contract/schema";
import { adminErrorResponse } from "@/lib/server/admin/types";
import { getModule } from "@/lib/server/admin/modules";
import { ADMIN_HEADERS, requireAdmin } from "@/lib/server/auth";
import { jsonError, jsonOk, requestId } from "@/lib/server/http";

/** GET /api/v1/admin/modules/{id} — published and draft content plus the analyzer result (F.2). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/v1/admin/modules/[id]">): Promise<Response> {
  const requestIdValue = requestId(request);
  const guard = await requireAdmin(requestIdValue);
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return jsonError("invalid_request", "moduleId must be a lower-case, hyphenated id.", 400, {
      requestId: requestIdValue,
      headers: ADMIN_HEADERS,
    });
  }

  try {
    const result = await getModule(parsed.data);
    if (!result.ok) return adminErrorResponse(result, requestIdValue);
    return jsonOk(result.value, { requestId: requestIdValue, headers: ADMIN_HEADERS });
  } catch (error) {
    console.error(`[${requestIdValue}] admin: loading module failed:`, error);
    return jsonError("internal", "Could not load that module.", 500, { requestId: requestIdValue, headers: ADMIN_HEADERS });
  }
}
