import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiting via Upstash Redis. Required env vars in production:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * Fail-open by design: if Upstash credentials are missing or Upstash itself
 * is unreachable, we let requests through. Locking users out during an
 * Upstash outage is a worse failure mode than temporarily losing the
 * protection. Missing credentials surface as a startup-time console warning
 * so production misconfiguration is loud.
 */

let redis: Redis | null = null;
let warnedMissingEnv = false;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warnedMissingEnv) {
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN " +
        "not set — rate limiting is disabled. Set both in Vercel before launch.",
      );
      warnedMissingEnv = true;
    }
    return null;
  }
  redis = new Redis({ url, token });
  return redis;
}

const limiters = new Map<string, Ratelimit>();

type Window = `${number} ${"s" | "m" | "h"}`;

function getOrCreateLimiter(name: string, limit: number, window: Window): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  const cached = limiters.get(name);
  if (cached) return cached;
  const limiter = new Ratelimit({
    redis:    r,
    limiter:  Ratelimit.slidingWindow(limit, window),
    prefix:   `bms-rl:${name}`,
    analytics: false,
  });
  limiters.set(name, limiter);
  return limiter;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the limit resets, only set when `allowed === false`. */
  retryAfterSeconds?: number;
}

/**
 * Check a rate limit. Fail-open when Upstash is not configured or the
 * limiter call itself throws (e.g. Upstash outage). Both cases log so the
 * gap is visible in production.
 */
export async function checkRateLimit(
  name: string,
  identifier: string,
  limit: number,
  window: Window,
): Promise<RateLimitResult> {
  const limiter = getOrCreateLimiter(name, limit, window);
  if (!limiter) return { allowed: true };

  try {
    const result = await limiter.limit(identifier);
    if (result.success) return { allowed: true };
    const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    return { allowed: false, retryAfterSeconds };
  } catch (err) {
    console.error(`[rate-limit] ${name} check failed, failing open:`, err);
    return { allowed: true };
  }
}

/** Standard 429 response with a Retry-After header. */
export function rateLimitResponse(retryAfterSeconds: number): Response {
  return new Response("Too Many Requests", {
    status: 429,
    headers: {
      "Retry-After":  String(retryAfterSeconds),
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

/**
 * Best-effort client IP extraction. Returns "unknown" rather than null so a
 * burst of header-less requests still groups into one rate-limit bucket
 * instead of bypassing limits entirely.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
