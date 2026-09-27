import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 proxy (it replaces middleware.ts). Two jobs:
 *
 * 1. Give every request an id, on the request so handlers can put it in the response body and on the
 *    response so a user can quote it (§6.3).
 * 2. Refresh the Supabase session, but only for /admin and /api/v1/admin/* (§10.2). Route handlers
 *    cannot write cookies, so the refresh has to happen here or admins are logged out at random.
 *
 * The regex is deliberately duplicated from lib/server/http.ts: the proxy runs separately from the
 * render path and may be deployed to the CDN, so Next's docs say not to rely on shared modules here.
 */
const REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;

const needsSession = (pathname: string): boolean =>
  pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/v1/admin/");

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const incoming = request.headers.get("x-request-id");
  const id = incoming !== null && REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", id);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", id);

  if (!needsSession(request.nextUrl.pathname)) return response;

  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (url === undefined || url.length === 0 || key === undefined || key.length === 0) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Verifies the JWT and writes a refreshed session back through setAll. An unauthenticated visitor is
  // not an error here: requireAdmin() decides on 401 and 403.
  await supabase.auth.getClaims();

  return response;
}

// Static assets and image optimisation need no request id and no session.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
