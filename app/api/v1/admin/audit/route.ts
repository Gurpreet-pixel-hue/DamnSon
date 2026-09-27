import type { NextRequest } from "next/server";
import { z } from "zod";
import { ADMIN_HEADERS, requireAdmin } from "@/lib/server/auth";
import { getPrisma } from "@/lib/server/db/client";
import { jsonError, jsonOk, requestId } from "@/lib/server/http";

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

/** GET /api/v1/admin/audit?limit=50 — the append-only record of every admin write (F.2, §6.4). */
export async function GET(request: NextRequest): Promise<Response> {
  const id = requestId(request);
  const guard = await requireAdmin(id);
  if (!guard.ok) return guard.response;

  const limitParam = new URL(request.url).searchParams.get("limit");
  const parsed = querySchema.safeParse(limitParam === null ? {} : { limit: limitParam });
  if (!parsed.success) {
    return jsonError("invalid_request", "limit must be between 1 and 200.", 400, { requestId: id, headers: ADMIN_HEADERS });
  }

  try {
    const rows = await getPrisma().auditLog.findMany({ orderBy: { id: "desc" }, take: parsed.data.limit });
    const entries = rows.map((row) => ({
      // The primary key is a bigint, which JSON cannot represent; the client only ever echoes it.
      id: row.id.toString(),
      at: row.at.toISOString(),
      actorId: row.actorId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      beforeHash: row.beforeHash,
      afterHash: row.afterHash,
    }));
    return jsonOk({ entries }, { requestId: id, headers: ADMIN_HEADERS });
  } catch (error) {
    console.error(`[${id}] admin: reading the audit log failed:`, error);
    return jsonError("internal", "Could not read the audit log.", 500, { requestId: id, headers: ADMIN_HEADERS });
  }
}
