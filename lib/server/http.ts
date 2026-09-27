import "server-only";
import { NextResponse } from "next/server";
import { ERROR_CODES, errorBodySchema } from "@/lib/contract/api";

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Only ids we could have issued ourselves are echoed back, so a client cannot inject text into our responses or logs. */
const REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;

/**
 * One id per request (§6.3). proxy.ts puts it on the request; handlers reuse it so the
 * response header, the body and the server logs all agree. Anything else gets a fresh id.
 */
export function requestId(request?: Request): string {
  const header = request?.headers.get("x-request-id");
  if (header !== null && header !== undefined && REQUEST_ID.test(header)) return header;
  return crypto.randomUUID();
}

/**
 * The error envelope from Appendix F. `message` is always a string we wrote: no exception is ever
 * passed in, so stack traces and driver messages cannot reach the client (§12.1).
 */
export function jsonError(
  code: ErrorCode,
  message: string,
  status: number,
  opts: { requestId: string; details?: unknown },
): NextResponse {
  const body = errorBodySchema.parse({
    error: { code, message: message.slice(0, 300), ...(opts.details === undefined ? {} : { details: opts.details }) },
    requestId: opts.requestId,
  });
  return NextResponse.json(body, { status, headers: { "x-request-id": opts.requestId } });
}

/** 200 with the request id on the header, for handlers whose body carries its own shape. */
export function jsonOk<T>(body: T, opts: { requestId: string; status?: number; headers?: Record<string, string> }): NextResponse {
  return NextResponse.json(body, {
    status: opts.status ?? 200,
    headers: { "x-request-id": opts.requestId, ...opts.headers },
  });
}
