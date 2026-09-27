import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 proxy (it replaces middleware.ts). Gives every request an id, on the request so
 * handlers can put it in the response body, and on the response so a user can quote it (§6.3).
 *
 * The regex is deliberately duplicated from lib/server/http.ts: the proxy runs separately from the
 * render path and may be deployed to the CDN, so Next's docs say not to rely on shared modules here.
 */
const REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;

export function proxy(request: NextRequest): NextResponse {
  const incoming = request.headers.get("x-request-id");
  const id = incoming !== null && REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", id);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", id);
  return response;
}

// Static assets and image optimisation need no request id (PL-5 adds session refresh for /admin).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
