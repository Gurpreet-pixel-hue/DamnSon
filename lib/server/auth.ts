import "server-only";
import { z } from "zod";
import { jsonError } from "./http";
import { getServerSupabase } from "./supabase";

/** Every admin response is per-user and must never be cached by a CDN or a browser (F.2). */
export const ADMIN_HEADERS = { "cache-control": "private, no-store" } as const;

/**
 * Only what authorisation depends on. getClaims() returns a loosely typed payload, so the role is
 * validated rather than read on trust (§13.2: zod at every boundary).
 */
const adminClaimsSchema = z.object({
  sub: z.string().min(1),
  app_metadata: z.object({ cw_role: z.string().optional() }).optional(),
});

export type AdminGuard = { ok: true; userId: string } | { ok: false; response: Response };

/**
 * 401 without a valid session, 403 without the role (§10.2).
 *
 * Uses getClaims(), which verifies the JWT signature, never getSession(), which trusts whatever is in
 * the cookie. The role lives in app_metadata, which only the secret key can write, so a signed-in
 * citizen cannot promote themselves.
 */
export async function requireAdmin(requestId: string): Promise<AdminGuard> {
  const unauthorized = (): AdminGuard => ({
    ok: false,
    response: jsonError("unauthorized", "Sign in to use the admin API.", 401, { requestId, headers: ADMIN_HEADERS }),
  });

  let claims: unknown;
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase.auth.getClaims();
    if (error !== null || data === null) return unauthorized();
    claims = data.claims;
  } catch (error) {
    console.error(`[${requestId}] admin: could not verify the session:`, error instanceof Error ? error.message : String(error));
    return unauthorized();
  }

  const parsed = adminClaimsSchema.safeParse(claims);
  if (!parsed.success) return unauthorized();

  if (parsed.data.app_metadata?.cw_role !== "admin") {
    return {
      ok: false,
      response: jsonError("forbidden", "This account is not an admin.", 403, { requestId, headers: ADMIN_HEADERS }),
    };
  }

  return { ok: true, userId: parsed.data.sub };
}
