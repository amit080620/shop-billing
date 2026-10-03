import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { keepWarmSource, KEEP_WARM_KEY } from "@/lib/speedWatch";
import { INSTANCE_ID } from "@/lib/instance";

export const dynamic = "force-dynamic";

const timed = async (fn: () => PromiseLike<unknown>): Promise<number> => {
  const t0 = Date.now();
  try {
    await fn();
    return Date.now() - t0;
  } catch {
    return -(Date.now() - t0);
  }
};

/** The deploy id this server is running — polled by VersionWatcher. Also says, yes or no, whether
 * error reports (Sentry) and analytics (PostHog) are switched on in this deploy, so that can be
 * checked from outside; never the keys themselves. The keep-warm pings (the database's pg_cron job,
 * GitHub's backup job) also call it; each notes when it last came, so Admin → Speed can show the
 * warmer is alive.
 *
 * ?probe=1 also times, from this server, one round trip each to Redis, the database and Supabase
 * Auth (milliseconds; negative when it failed), to tell which one a slow moment waits on. No data
 * is returned. */
export async function GET(request: Request) {
  const source = keepWarmSource(request.headers.get("user-agent"));
  if (source) {
    try {
      await getRedis()?.hset(KEEP_WARM_KEY, { [source]: Date.now() });
    } catch {
      // Only a health note; never fails the answer.
    }
  }
  let probe: Record<string, number> | undefined;
  if (new URL(request.url).searchParams.get("probe") === "1") {
    const redis = getRedis();
    const db = createSupabaseAdminClient();
    const [r, d, a] = await Promise.all([
      timed(async () => redis?.ping()),
      timed(async () => {
        const { error } = await db.from("shops").select("id").limit(1);
        if (error) throw error;
      }),
      timed(() => fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" }, cache: "no-store" })),
    ]);
    probe = { redis: r, database: d, auth: a };
    // ?page=/challans: this server opens that screen itself, as the caller (their cookies), and
    // times it — the screen's own server time, without the caller's internet in between.
    const page = new URL(request.url).searchParams.get("page");
    if (page && /^\/[a-z0-9/_-]*$/i.test(page)) {
      const t0 = Date.now();
      let first = 0;
      let status = 0;
      try {
        const res = await fetch(new URL(page, request.url), { headers: { cookie: request.headers.get("cookie") ?? "", accept: "text/html" }, redirect: "manual", cache: "no-store" });
        first = Date.now() - t0;
        status = res.status;
        await res.text();
      } catch {
        status = -1;
      }
      probe.page = Date.now() - t0;
      probe.pageFirstByte = first;
      probe.pageStatus = status;
    }
  }
  return NextResponse.json(
    { id: process.env.NEXT_PUBLIC_BUILD_ID, instance: INSTANCE_ID, monitoring: { sentry: !!process.env.SENTRY_DSN, posthog: !!process.env.NEXT_PUBLIC_POSTHOG_KEY }, ...(probe ? { probe } : {}) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
