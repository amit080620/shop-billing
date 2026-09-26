import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "./redis";
import { isDemoEmail } from "./demo/config";

// Generous by design — these exist to catch a genuine runaway (a bug
// looping, or one shop hammering a feature) rather than to pinch
// normal daily use. A typical shop's real usage is a small fraction
// of these numbers.
const DAILY_LIMITS = {
  assistant: 200, // AI Shop Assistant chat messages per shop per day
  voice: 150, // Voice billing parses per shop per day
  scan: 100, // Gemini scan calls (products/purchase/khata/sales-history) per shop per day
} as const;

// The public demo shops share the app's AI key with everyone, so they get a small taste only.
const DEMO_DAILY_LIMITS = { assistant: 12, voice: 8, scan: 5 } as const;

export type AiQuotaFeature = keyof typeof DAILY_LIMITS;

const limiters = new Map<AiQuotaFeature, Ratelimit>();

function getLimiter(feature: AiQuotaFeature, demo: boolean): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  const key = `${demo ? "demo:" : ""}${feature}` as AiQuotaFeature;
  const existing = limiters.get(key);
  if (existing) return existing;
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow((demo ? DEMO_DAILY_LIMITS : DAILY_LIMITS)[feature], "1 d"),
    prefix: `ray:aiquota:${demo ? "demo:" : ""}${feature}`,
  });
  limiters.set(key, limiter);
  return limiter;
}

/** Checks (and consumes one unit of) a shop's daily allowance for a
 * given AI feature. Fails OPEN — if Redis isn't configured (nothing
 * set up yet) or the check itself errors, this returns "allowed"
 * rather than blocking a real feature because an optional
 * infrastructure piece is unavailable. Without Upstash configured,
 * this is simply a no-op and every call is allowed, exactly as
 * before this existed. */
export async function checkAiQuota(shopId: string, feature: AiQuotaFeature, email?: string | null): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const demo = isDemoEmail(email);
  const limit = (demo ? DEMO_DAILY_LIMITS : DAILY_LIMITS)[feature];
  const limiter = getLimiter(feature, demo);
  // Without Redis a demo has no counter to lean on, so the AI stays off there rather than open.
  if (!limiter) return { allowed: !demo, remaining: limit, limit };
  try {
    const result = await limiter.limit(shopId);
    return { allowed: result.success, remaining: result.remaining, limit };
  } catch (err) {
    console.error(`AI quota check failed for ${feature}`, err);
    return { allowed: !demo, remaining: limit, limit };
  }
}
