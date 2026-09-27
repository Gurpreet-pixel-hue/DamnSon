import "server-only";
import { createHmac } from "node:crypto";

/**
 * Service token for BFF → intelligence calls (§6.5).
 * `Bearer <exp>.<sig>`, where exp is Unix seconds and sig is the lowercase hex HMAC-SHA256 of the
 * ASCII digits of exp. The service accepts while now ≤ exp ≤ now + 120, so a leaked token is useless
 * within two minutes. Both sides test the same fixed vector.
 */
const TTL_SECONDS = 60;

export function signServiceToken(secret: string, expUnixSeconds: number): string {
  const signature = createHmac("sha256", secret).update(String(expUnixSeconds), "ascii").digest("hex");
  return `${expUnixSeconds}.${signature}`;
}

/** Throws rather than sending an unsigned request: an unauthenticated call would be rejected anyway. */
export function serviceAuthorizationHeader(nowMs: number = Date.now()): string {
  const secret = process.env["INTERNAL_SERVICE_SECRET"];
  if (secret === undefined || secret.length === 0) {
    throw new Error("INTERNAL_SERVICE_SECRET is not set");
  }
  return `Bearer ${signServiceToken(secret, Math.floor(nowMs / 1000) + TTL_SECONDS)}`;
}
