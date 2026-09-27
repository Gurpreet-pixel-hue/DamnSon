import "server-only";
import type { GraphIssue } from "@/lib/contract/analyze";
import { ADMIN_HEADERS } from "../auth";
import { jsonError } from "../http";
import type { PrismaClient } from "../db/generated/client";

/** The interactive-transaction client Prisma hands to $transaction. */
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Service results carry the reason, so a route maps them to a status code without the service
 * needing to know about HTTP (§6.3).
 */
export type AdminResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "not_found"; message: string }
  | { ok: false; code: "conflict"; message: string }
  | { ok: false; code: "invalid_graph"; message: string; issues: GraphIssue[] };

export type AuditAction = "module.save_draft" | "module.publish" | "template.publish";

/** Every admin write leaves a row (§6.4, §12.1). Hashes, never content, so the log stays small. */
export async function writeAudit(
  tx: Tx,
  entry: {
    actorId: string;
    action: AuditAction;
    entityType: string;
    entityId: string;
    beforeHash?: string | null;
    afterHash?: string | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      actorRole: "admin",
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      beforeHash: entry.beforeHash ?? null,
      afterHash: entry.afterHash ?? null,
    },
  });
}

/** Maps a service failure to its status code, so every admin route reports the same way (F.2). */
export function adminErrorResponse(
  result: Extract<AdminResult<never>, { ok: false }>,
  requestId: string,
): Response {
  if (result.code === "not_found") {
    return jsonError("not_found", result.message, 404, { requestId, headers: ADMIN_HEADERS });
  }
  if (result.code === "conflict") {
    return jsonError("conflict", result.message, 409, { requestId, headers: ADMIN_HEADERS });
  }
  return jsonError("invalid_graph", result.message, 422, {
    requestId,
    headers: ADMIN_HEADERS,
    details: { issues: result.issues },
  });
}
