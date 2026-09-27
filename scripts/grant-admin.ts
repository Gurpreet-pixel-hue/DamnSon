// scripts/grant-admin.ts <email> [--password <pw>] [--role admin|citizen]
//   npm run grant-admin -- someone@example.com                    → invites them, then grants the role
//   npm run grant-admin -- tester@example.com --password X        → creates a confirmed account (test admins)
//   npm run grant-admin -- someone@example.com --role citizen     → revokes the role (also makes a 403 fixture)
//
// Local only. Uses SUPABASE_SECRET_KEY, which is never deployed (§10.2). App code never imports this.
import { config } from "dotenv";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

config({ path: [".env.local", ".env"], quiet: true });

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function findByEmail(admin: SupabaseClient, email: string): Promise<User | undefined> {
  // There is no get-by-email in the admin API, so page through until the address turns up.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error !== null) throw new Error(error.message);
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match !== undefined) return match;
    if (data.users.length < 200) return undefined;
  }
  return undefined;
}

async function main(): Promise<void> {
  const email = process.argv[2];
  if (email === undefined || !email.includes("@")) {
    throw new Error("usage: npm run grant-admin -- <email> [--password <password>]");
  }

  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const secret = process.env["SUPABASE_SECRET_KEY"];
  if (url === undefined || url.length === 0 || secret === undefined || secret.length === 0) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be in .env.local");
  }

  const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  const password = arg("--password");
  const role = arg("--role") ?? "admin";
  if (role !== "admin" && role !== "citizen") throw new Error("--role must be admin or citizen");

  let user = await findByEmail(admin, email);
  if (user === undefined) {
    if (password === undefined) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
      if (error !== null) throw new Error(`invite failed: ${error.message}`);
      user = data.user;
      console.log(`invited ${email}`);
    } else {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error !== null) throw new Error(`create failed: ${error.message}`);
      if (data.user === null) throw new Error("create returned no user");
      user = data.user;
      console.log(`created ${email} with a password`);
    }
  } else {
    console.log(`found ${email}`);
    if (password !== undefined) {
      const { error } = await admin.auth.admin.updateUserById(user.id, { password });
      if (error !== null) throw new Error(`resetting the password failed: ${error.message}`);
      console.log("password reset");
    }
  }

  // cw_role is only ever set through the secret key, so a signed-in citizen cannot promote themselves.
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: role === "admin" ? { cw_role: "admin" } : { cw_role: null },
  });
  if (error !== null) throw new Error(`setting the role failed: ${error.message}`);

  console.log(
    role === "admin"
      ? `${email} is now an admin (app_metadata.cw_role = "admin", id ${user.id})`
      : `${email} is no longer an admin (id ${user.id})`,
  );
  console.log("They must sign out and in again for a new token to carry the change.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
