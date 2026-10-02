import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { keepWarmSource, KEEP_WARM_KEY } from "@/lib/speedWatch";

export const dynamic = "force-dynamic";

/** The deploy id this server is running — polled by VersionWatcher. The keep-warm pings (the
 * database's pg_cron job, GitHub's backup job) also call it; each notes when it last came, so Admin →
 * Speed can show the warmer is alive. */
export async function GET(request: Request) {
  const source = keepWarmSource(request.headers.get("user-agent"));
  if (source) {
    try {
      await getRedis()?.hset(KEEP_WARM_KEY, { [source]: Date.now() });
    } catch {
      // Only a health note; never fails the answer.
    }
  }
  return NextResponse.json({ id: process.env.NEXT_PUBLIC_BUILD_ID }, { headers: { "Cache-Control": "no-store" } });
}
