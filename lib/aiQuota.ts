import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "./redis";
import { isDemoEmail } from "./demo/config";
import { AI_DAILY, type PlanKey } from "./plans";

// The daily allowance comes from the shop's plan (lib/plans AI_DAILY): every AI call costs The
// Ray money, so Free and Basic get a taste and Pro and up use it every day.

// The public demo shops share the app's AI key with everyone, so they get a small taste only.
const DEMO_DAILY_LIMITS = { assistant: 12, voice: 8, scan: 5 } as const;

export type AiQuotaFeature = keyof typeof DEMO_DAILY_LIMITS;

const limiters = new Map<string, Ratelimit>();

function getLimiter(feature: AiQuotaFeature, tier: string, limit: number): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  const key = `${tier}:${feature}`;
  const existing = limiters.get(key);
  if (existing) return existing;
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, "1 d"),
    prefix: `ray:aiquota:${tier}:${feature}`,
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
export async function checkAiQuota(shopId: string, feature: AiQuotaFeature, email?: string | null, plan: PlanKey = "pro_plus"): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const demo = isDemoEmail(email);
  const limit = demo ? DEMO_DAILY_LIMITS[feature] : (AI_DAILY[plan] ?? AI_DAILY.pro)[feature];
  const limiter = getLimiter(feature, demo ? "demo" : plan, limit);
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
