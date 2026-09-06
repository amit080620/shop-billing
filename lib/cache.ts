import { getRedis } from "./redis";

/** Genuinely reusable caching for any expensive, repeated server-side
 * computation — not a wholesale "convert everything to API routes"
 * (which wouldn't actually help; Server Actions already run on the
 * same serverless infrastructure API routes would), but the ACTUAL
 * lever for speed: don't recompute the same heavy query for the same
 * shop over and over within a short window.
 *
 * Fails open — if Redis isn't configured or errors, this just calls
 * `compute()` fresh every time, exactly as if caching didn't exist.
 * Nothing ever breaks because of this being unavailable. */
export async function cached<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  if (!redis) return compute();

  try {
    const hit = await redis.get<T>(key);
    if (hit !== null && hit !== undefined) return hit;
  } catch (err) {
    console.error(`Cache read failed for ${key}, computing fresh`, err);
  }

  const fresh = await compute();

  try {
    await redis.set(key, fresh, { ex: ttlSeconds });
  } catch (err) {
    console.error(`Cache write failed for ${key}`, err);
  }

  return fresh;
}

/** Call this after any write that would make a cached read stale —
 * e.g. after creating a product, invalidate that shop's product-list
 * cache so the next read is fresh rather than waiting out the TTL. */
export async function invalidateCache(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (err) {
    console.error(`Cache invalidation failed for ${key}`, err);
  }
}
