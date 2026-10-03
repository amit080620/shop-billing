import { requireSession } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import { istDay, SPEED_KEEP_DAYS, speedKey, type SpeedContext, type SpeedEvent } from "@/lib/speedWatch";

const KINDS = new Set(["open", "save", "load"]);
const text = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 ? v.slice(0, max) : undefined);
const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : undefined);

/** A batch of timings from a shop's phone (app/components/SpeedWatch), kept per day in Redis for
 * Admin → Speed. Sent with sendBeacon in the background; the shop comes from the session, never
 * from the phone. */
export async function POST(request: Request) {
  const session = await requireSession();
  const redis = getRedis();
  if (!redis) return new Response(null, { status: 204 });

  let body: { ctx?: Partial<SpeedContext>; events?: Partial<SpeedEvent>[] };
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const c = body.ctx ?? {};
  const ctx: SpeedContext = { d: text(c.d, 24) ?? "?", n: text(c.n, 8), m: num(c.m, 64), l: c.l === 1 ? 1 : 0, b: text(c.b, 12) };
  const at = Math.floor(Date.now() / 1000);
  const rows = (Array.isArray(body.events) ? body.events : [])
    .slice(0, 50)
    .map((e) => {
      const ms = num(e.ms, 120_000);
      const p = text(e.p, 60);
      if (!e.k || !KINDS.has(e.k) || ms === undefined || !p) return null;
      return JSON.stringify({ k: e.k, f: text(e.f, 60), p, ms, full: e.full === 1 ? 1 : undefined, c: e.c === 1 ? 1 : undefined, sv: num(e.sv, 120_000), ttfb: num(e.ttfb, 120_000), ...ctx, s: session.shopId, at });
    })
    .filter((row): row is string => row !== null);
  if (!rows.length) return new Response(null, { status: 204 });

  const key = speedKey(istDay());
  try {
    const [length] = (await redis.pipeline().rpush(key, ...rows).expire(key, SPEED_KEEP_DAYS * 86400).exec()) as [number, number];
    // A runaway day stays bounded.
    if (length > 60_000) await redis.ltrim(key, -50_000, -1);
  } catch {
    // Timings are best-effort; never an error for the phone.
  }
  return new Response(null, { status: 204 });
}
