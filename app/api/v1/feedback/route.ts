import type { NextRequest } from "next/server";
import { feedbackRequestSchema } from "@/lib/contract/api";
import { getPrisma } from "@/lib/server/db/client";
import { jsonError, jsonOk, readJsonBody, requestId } from "@/lib/server/http";
import { clientIp, consume, ipHash } from "@/lib/server/rateLimit";

/** POST /api/v1/feedback — report a problem or request a procedure (§5 F13, §10.1). */
export async function POST(request: NextRequest): Promise<Response> {
  const id = requestId(request);

  const incoming = await readJsonBody(request, { requestId: id });
  if (!incoming.ok) return incoming.response;
  const raw = incoming.value;

  const parsed = feedbackRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("invalid_request", "The feedback request is not valid.", 400, {
      requestId: id,
      details: { fields: [...new Set(parsed.error.issues.map((issue) => issue.path.map(String).join(".")))] },
    });
  }

  const limit = consume("feedback", ipHash(clientIp(request)));
  if (!limit.ok) {
    return jsonError("rate_limited", "Too much feedback from here. Try again in a minute.", 429, {
      requestId: id,
      headers: { "retry-after": String(limit.retryAfterSeconds) },
    });
  }

  // Feedback is the one public write, so it needs the database; the file repositories are read-only (§6.6).
  if ((process.env["DATA_SOURCE"] ?? "files") !== "db") {
    return jsonError("upstream_unavailable", "Feedback cannot be recorded right now.", 503, { requestId: id });
  }

  const { kind, taskId, stepId, revision, message } = parsed.data;
  try {
    const created = await getPrisma().feedback.create({
      data: {
        kind,
        templateId: taskId ?? null,
        stepId: stepId ?? null,
        revision: revision ?? null,
        message: message ?? null,
        // The raw IP is never stored, only a daily-salted hash (§12.1).
        ipHash: ipHash(clientIp(request)),
      },
      select: { id: true },
    });
    return jsonOk({ id: created.id }, { requestId: id, status: 201 });
  } catch (error) {
    console.error(`[${id}] feedback: insert failed:`, error);
    return jsonError("internal", "Feedback could not be recorded.", 500, { requestId: id });
  }
}
