import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client bound to the request's cookies (§10.2).
 *
 * A new client per render, never shared across requests. getAll/setAll are required: the deprecated
 * get/set/remove trio misses edge cases and causes random logouts. Route handlers may not be able to
 * write cookies, so proxy.ts owns the refresh and setAll here is a no-op guard.
 *
 * Only the publishable key is used. With RLS on and no policies it can read no table, so the sole job
 * of this client is verifying who the caller is.
 */
export async function getServerSupabase(): Promise<SupabaseClient> {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (url === undefined || url.length === 0 || key === undefined || key.length === 0) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set");
  }

  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) store.set(name, value, options);
        } catch {
          // Called from a route handler or server component, where cookies are read-only.
          // proxy.ts refreshes the session for /admin and /api/v1/admin/*, so nothing is lost.
        }
      },
    },
  });
}
