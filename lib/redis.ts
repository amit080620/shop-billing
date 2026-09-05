import { Redis } from "@upstash/redis";

/** One shared Redis client, used for two genuinely different jobs
 * across this serverless app:
 *  1. Rate-limiting AI calls (Groq/Gemini) per shop — a plain
 *     in-memory counter can't work here since every Vercel function
 *     invocation is its own fresh process; Redis is the actual
 *     shared state that survives across requests.
 *  2. Caching expensive, repeatedly-computed data (dashboard
 *     aggregations, profit-leak numbers) for a short TTL, so a
 *     dashboard visited twice in five minutes doesn't re-run the
 *     same heavy queries twice.
 *
 * Returns null when the env vars aren't set — every caller treats a
 * null client as "skip the optimization, just do the normal DB work"
 * rather than crashing, so Redis is a genuine enhancement, never a
 * hard dependency for the app to function. */
export function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}
