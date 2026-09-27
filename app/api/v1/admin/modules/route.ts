import type { NextRequest } from "next/server";
import { ADMIN_HEADERS, requireAdmin } from "@/lib/server/auth";
import { listModules } from "@/lib/server/admin/modules";
import { jsonError, jsonOk, requestId } from "@/lib/server/http";

/** GET /api/v1/admin/modules — every module with its published and draft versions (F.2). */
export async function GET(request: NextRequest): Promise<Response> {
  const id = requestId(request);
  const guard = await requireAdmin(id);
  if (!guard.ok) return guard.response;

  try {
    return jsonOk({ modules: await listModules() }, { requestId: id, headers: ADMIN_HEADERS });
  } catch (error) {
    console.error(`[${id}] admin: listing modules failed:`, error);
    return jsonError("internal", "Could not list modules.", 500, { requestId: id, headers: ADMIN_HEADERS });
  }
}
