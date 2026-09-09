/**
 * rateLimiter.ts
 *
 * In-memory sliding-window rate limiter for Vercel serverless functions.
 *
 * IMPORTANT: This limiter is per-serverless-instance, not globally distributed.
 * Vercel may run multiple concurrent instances; a client that hits different
 * warm instances will see independent counters per instance.
 *
 * This is an intentional first-layer defense — it reliably catches burst abuse
 * on warm instances (which Vercel reuses aggressively for sticky clients) while
 * adding zero Firestore read/write cost per request.
 *
 * A globally consistent rate limiter would require 1 Firestore read + 1 write
 * per request, burning ~40k ops/day on moderate traffic and defeating the quota
 * savings from answer caching. That tradeoff is not appropriate on the free
 * Spark plan.
 *
 * Usage:
 *   const result = checkRateLimit(ip, 20, 60_000);
 *   if (!result.allowed) return 429;
 */

type WindowEntry = {
  timestamps: number[]; // sorted request timestamps within the window
};

// Module-level map — persists across warm invocations on the same instance.
// Keys are client identifiers (IP or "unknown").
const _windows = new Map<string, WindowEntry>();

// Prevent unbounded memory growth: prune keys that have been idle for 10 minutes.
const MAX_IDLE_MS = 10 * 60 * 1000;
let _lastPruneAt = Date.now();

function pruneIdleEntries(now: number): void {
  if (now - _lastPruneAt < 60_000) return; // only prune at most once per minute
  _lastPruneAt = now;
  for (const [key, entry] of _windows.entries()) {
    if (entry.timestamps.length === 0 || now - entry.timestamps[entry.timestamps.length - 1] > MAX_IDLE_MS) {
      _windows.delete(key);
    }
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;     // requests remaining in the current window
  retryAfter: number;    // seconds until the oldest request falls out of the window
};

/**
 * Checks whether the given key is within its rate limit.
 *
 * @param key       - Client identifier (IP address, or a safe fallback string)
 * @param limit     - Maximum requests allowed within windowMs
 * @param windowMs  - Rolling window duration in milliseconds
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  pruneIdleEntries(now);

  const cutoff = now - windowMs;
  let entry = _windows.get(key);

  if (!entry) {
    entry = { timestamps: [] };
    _windows.set(key, entry);
  }

  // Slide the window: remove timestamps older than the cutoff
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= limit) {
    // Rate limit exceeded
    const oldest = entry.timestamps[0];
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, retryAfter),
    };
  }

  // Admit this request
  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: limit - entry.timestamps.length,
    retryAfter: 0,
  };
}

/**
 * Extracts the client IP from a Vercel serverless request.
 *
 * Vercel sets x-forwarded-for. On local dev the header may be absent;
 * falls back to "unknown" which is treated permissively (never blocked)
 * to avoid false positives in development.
 */
export function extractClientIp(req: {
  headers?: Record<string, string | string[] | undefined> | any;
}): string {
  const forwarded =
    req?.headers?.["x-forwarded-for"] ??
    req?.headers?.get?.("x-forwarded-for") ??
    null;

  if (!forwarded) return "unknown";

  // x-forwarded-for can be a comma-separated list; the first is the real client IP
  const raw = Array.isArray(forwarded) ? forwarded[0] : String(forwarded);
  return typeof raw === "string" ? raw.split(",")[0].trim() || "unknown" : "unknown";
}
