import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Per-IP rate limits (§10.1, §12.1). In-memory, so each server instance keeps its own counters:
 * enough to stop a single abusive client in the hackathon. Redis would make this shared (P2).
 */
export const LIMITS_PER_MINUTE = { search: 20, copilot: 10, feedback: 5 } as const;
export type RateLimitBucket = keyof typeof LIMITS_PER_MINUTE;

const WINDOW_MS = 60_000;

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

/** Without a configured salt, a per-process random one still prevents reversing a hash to an IP. */
const fallbackSalt = randomBytes(32).toString("hex");

/**
 * Identifies a client without storing their IP. The UTC date in the input rotates the hash daily, so
 * yesterday's hashes cannot be linked to today's (§12.1, DPDP).
 */
export function ipHash(ip: string, now: Date = new Date()): string {
  const salt = process.env["IP_HASH_SALT"];
  const effective = salt === undefined || salt.length === 0 ? fallbackSalt : salt;
  return createHash("sha256").update(`${effective}:${now.toISOString().slice(0, 10)}:${ip}`).digest("hex");
}

/**
 * Identifies the caller for rate limiting.
 *
 * x-real-ip is preferred because the proxy sets it from the actual peer, whereas a client can prepend
 * its own entry to x-forwarded-for — so trusting the first entry there lets anyone rotate a fake
 * address and walk past the limit (#10 review). x-forwarded-for is only a fallback for platforms that
 * do not set x-real-ip. Unknown callers share one bucket, which is the safe side.
 */
export function clientIp(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real !== undefined && real.length > 0) return real;
  const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first !== undefined && first.length > 0 ? first : "unknown";
}

export interface RateLimitResult {
  ok: boolean;
  /** Whole seconds until one token is available again; 0 when allowed. */
  retryAfterSeconds: number;
}

/** Token bucket: capacity is the per-minute limit, refilled continuously over the window. */
export function consume(bucket: RateLimitBucket, key: string, nowMs: number = Date.now()): RateLimitResult {
  const capacity = LIMITS_PER_MINUTE[bucket];
  const perMs = capacity / WINDOW_MS;
  const id = `${bucket}:${key}`;

  const existing = buckets.get(id);
  const tokens = existing === undefined ? capacity : Math.min(capacity, existing.tokens + (nowMs - existing.updatedAt) * perMs);

  if (tokens < 1) {
    buckets.set(id, { tokens, updatedAt: nowMs });
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / perMs / 1000)) };
  }

  buckets.set(id, { tokens: tokens - 1, updatedAt: nowMs });
  if (buckets.size > 10_000) prune(nowMs);
  return { ok: true, retryAfterSeconds: 0 };
}

/** Drops buckets that have refilled completely; they carry no information. */
function prune(nowMs: number): void {
  for (const [id, entry] of buckets) {
    if (nowMs - entry.updatedAt > WINDOW_MS) buckets.delete(id);
  }
}

/** Test-only: the counters are process-global, so a test must be able to start from a clean state. */
export function resetRateLimits(): void {
  buckets.clear();
}
