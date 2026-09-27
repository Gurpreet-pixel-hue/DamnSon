import type { NextRequest } from "next/server";
import { z } from "zod";
import { version } from "@/package.json";
import { healthResponseSchema } from "@/lib/contract/api";
import { jsonOk, requestId } from "@/lib/server/http";

const dataSourceSchema = z.enum(["files", "db", "fixtures"]);

/**
 * GET /api/v1/health — liveness and which data source is in use (§10.1).
 * db and intelligence report "skipped" until PL-3 and PL-6 wire up their checks.
 */
export function GET(request: NextRequest): Response {
  const id = requestId(request);
  // A misconfigured DATA_SOURCE shows up as ok: false rather than a crash, so the check stays useful.
  const parsed = dataSourceSchema.safeParse(process.env["DATA_SOURCE"] ?? "files");

  const body = healthResponseSchema.parse({
    ok: parsed.success,
    version,
    dataSource: parsed.success ? parsed.data : "files",
    db: "skipped",
    intelligence: "skipped",
  });
  return jsonOk(body, { requestId: id, headers: { "cache-control": "no-store" } });
}
