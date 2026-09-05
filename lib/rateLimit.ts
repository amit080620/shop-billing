/** Best-effort rate limiting for public, unauthenticated endpoints
 * (catalog orders, bookings) — these can be hit by anyone with the
 * shop's public link, with no login required, so some
 * abuse-deterrence is genuinely worth having even if imperfect.
 *
 * Uses Upstash Redis when it's configured (UPSTASH_REDIS_REST_URL/
 * TOKEN) for a genuinely global, cross-instance limit — the correct
 * fix for the honest gap this file used to call out (in-memory alone
 * only protects a single warm serverless instance, not the shop as a
 * whole). Falls back to the original in-memory behavior when Redis
 * isn't set up, so this keeps working with zero config either way. */

import { getRedis } from "./redis";

const attempts = new Map<string, number[]>();

function checkInMemory(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = attempts.get(key) ?? [];
  const withinWindow = existing.filter((t) => now - t < windowMs);

  if (withinWindow.length >= maxAttempts) {
    attempts.set(key, withinWindow);
    return false;
  }

  withinWindow.push(now);
  attempts.set(key, withinWindow);

  // Genuine light cleanup — keep the map from growing forever across
  // a long-lived warm instance by occasionally forgetting old keys.
  if (attempts.size > 5000) {
    for (const [k, times] of attempts) {
      if (times.every((t) => now - t > windowMs)) attempts.delete(k);
    }
  }

  return true;
}

/** Returns true if this key is genuinely within its allowed rate,
 * false if it should be rejected. Synchronous in-memory fallback is
 * kept for callers that can't await (rare) — see checkRateLimitAsync
 * for the Redis-backed version every real caller should prefer. */
export function checkRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  return checkInMemory(key, maxAttempts, windowMs);
}

/** The genuinely cross-instance version — uses Redis's own atomic
 * INCR + EXPIRE when available, which is what makes this actually
 * global across every serverless instance instead of per-warm-lambda.
 * Fails open to the in-memory check if Redis isn't configured or the
 * call itself errors, so an optional infra piece being down never
 * blocks a real public endpoint. */
export async function checkRateLimitAsync(key: string, maxAttempts: number, windowMs: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return checkInMemory(key, maxAttempts, windowMs);
  try {
    const redisKey = `ray:pubratelimit:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.pexpire(redisKey, windowMs);
    return count <= maxAttempts;
  } catch (err) {
    console.error("Redis rate limit check failed, falling back to in-memory", err);
    return checkInMemory(key, maxAttempts, windowMs);
  }
}
