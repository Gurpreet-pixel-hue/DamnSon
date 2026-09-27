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
  opts: { requestId: string; details?: unknown; headers?: Record<string, string> },
): NextResponse {
  const body = errorBodySchema.parse({
    error: { code, message: message.slice(0, 300), ...(opts.details === undefined ? {} : { details: opts.details }) },
    requestId: opts.requestId,
  });
  return NextResponse.json(body, { status, headers: { "x-request-id": opts.requestId, ...opts.headers } });
}

/**
 * Body size caps (#10 review). Reading an unbounded body into memory is a cheap way to hurt a serverless
 * function, so the size is checked before anything is parsed.
 *
 * Public endpoints send a sentence and a few flags, so 16 KB is generous. The admin draft endpoint sends
 * a whole approval module: the MCGM water-connection module is already ~26 KB at 11 steps, and the schema
 * allows 20, so that one needs real headroom.
 */
export const MAX_BODY_BYTES = 16 * 1024;
export const MAX_ADMIN_BODY_BYTES = 512 * 1024;

const TOO_LARGE = Symbol("too_large");

/** Reads at most maxBytes. A chunked body with no content-length is capped as it streams. */
async function readCapped(request: Request, maxBytes: number): Promise<string | typeof TOO_LARGE> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > maxBytes) return TOO_LARGE;
  }

  const body = request.body;
  if (body === null) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return TOO_LARGE;
    }
    chunks.push(value);
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

export type JsonBody = { ok: true; value: unknown } | { ok: false; response: NextResponse };

/**
 * Reads and parses a JSON body, refusing anything oversized before it is parsed.
 *
 * Oversized bodies answer 400 `invalid_request` rather than 413: the error codes are a fixed contract
 * (Appendix F) with no payload code, and §10.1 does not list 413, so a new status would reach clients
 * that have no handling for it.
 */
export async function readJsonBody(
  request: Request,
  opts: { requestId: string; maxBytes?: number; headers?: Record<string, string> },
): Promise<JsonBody> {
  const text = await readCapped(request, opts.maxBytes ?? MAX_BODY_BYTES);
  if (text === TOO_LARGE) {
    return {
      ok: false,
      response: jsonError("invalid_request", "The request body is too large.", 400, {
        requestId: opts.requestId,
        ...(opts.headers === undefined ? {} : { headers: opts.headers }),
      }),
    };
  }

  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      response: jsonError("invalid_json", "The request body is not valid JSON.", 400, {
        requestId: opts.requestId,
        ...(opts.headers === undefined ? {} : { headers: opts.headers }),
      }),
    };
  }
}

/** 200 with the request id on the header, for handlers whose body carries its own shape. */
export function jsonOk<T>(body: T, opts: { requestId: string; status?: number; headers?: Record<string, string> }): NextResponse {
  return NextResponse.json(body, {
    status: opts.status ?? 200,
    headers: { "x-request-id": opts.requestId, ...opts.headers },
  });
}
