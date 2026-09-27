import type { NextRequest } from "next/server";
import { z } from "zod";
import { version } from "@/package.json";
import { healthResponseSchema } from "@/lib/contract/api";
import { getPrisma } from "@/lib/server/db/client";
import { jsonOk, requestId } from "@/lib/server/http";

const dataSourceSchema = z.enum(["files", "db", "fixtures"]);

/** A slow database must not make the liveness check itself slow (§10.1). */
async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function checkDb(dataSource: "files" | "db" | "fixtures"): Promise<"up" | "down" | "skipped"> {
  // Only claim to know when we actually depend on it; the file repositories need no database.
  if (dataSource !== "db") return "skipped";
  try {
    await withTimeout(getPrisma().$queryRaw`SELECT 1`, 1000);
    return "up";
  } catch (error) {
    console.error("health: database check failed:", error instanceof Error ? error.message : String(error));
    return "down";
  }
}

/**
 * GET /api/v1/health — liveness, which data source is in use, and dependency status (§10.1).
 * The intelligence check arrives with PL-6.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const id = requestId(request);
  // A misconfigured DATA_SOURCE shows up as ok: false rather than a crash, so the check stays useful.
  const parsed = dataSourceSchema.safeParse(process.env["DATA_SOURCE"] ?? "files");
  const dataSource = parsed.success ? parsed.data : "files";
  const db = await checkDb(dataSource);

  const body = healthResponseSchema.parse({
    ok: parsed.success && db !== "down",
    version,
    dataSource,
    db,
    intelligence: "skipped",
  });
  return jsonOk(body, { requestId: id, headers: { "cache-control": "no-store" } });
}
