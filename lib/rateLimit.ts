/** Genuine best-effort rate limiting for public, unauthenticated
 * endpoints (catalog orders, bookings) — these can be hit by anyone
 * with the shop's public link, with no login required, so some
 * abuse-deterrence is genuinely worth having even if imperfect.
 *
 * Honest limitation: this is in-memory, so on serverless (Vercel) it
 * only protects within a single warm function instance, not globally
 * across every instance handling requests for this shop. A genuinely
 * complete, cross-instance solution would need a shared store (Redis/
 * Upstash) — not set up here. This still deters basic scripted abuse
 * hitting the same warm instance repeatedly, which is genuinely the
 * most common real-world case. */

const attempts = new Map<string, number[]>();

/** Returns true if this key is genuinely within its allowed rate,
 * false if it should be rejected. Automatically forgets attempts
 * older than the window so the map doesn't grow unbounded. */
export function checkRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
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
