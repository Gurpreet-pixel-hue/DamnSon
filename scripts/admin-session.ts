// scripts/admin-session.ts: prints a Cookie header for an authenticated admin session.
// Local only, for scripts/admin-curl.sh. Defaults to TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD from
// .env.local; pass an email and password as arguments to sign in as somebody else (the 403 fixture).
//
// The cookies are produced by @supabase/ssr itself rather than hand-built, so they are exactly what
// the server reads back, whatever the library's current encoding and chunking rules are.
import { config } from "dotenv";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

config({ path: [".env.local", ".env"], quiet: true });

async function main(): Promise<void> {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  const email = process.argv[2] ?? process.env["TEST_ADMIN_EMAIL"];
  const password = process.argv[3] ?? process.env["TEST_ADMIN_PASSWORD"];
  if (!url || !key || !email || !password) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD must be in .env.local");
  }

  // Sign in exactly as the browser would: publishable key, email and password.
  const browser = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await browser.auth.signInWithPassword({ email, password });
  if (error !== null) throw new Error(`sign-in failed: ${error.message}`);
  if (data.session === null) throw new Error("sign-in returned no session");

  const jar = new Map<string, string>();
  const server = createServerClient(url, key, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) jar.set(name, value);
      },
    },
  });
  const { error: setError } = await server.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (setError !== null) throw new Error(`could not serialise the session: ${setError.message}`);
  if (jar.size === 0) throw new Error("no cookies were written");

  process.stdout.write([...jar].map(([name, value]) => `${name}=${value}`).join("; "));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
