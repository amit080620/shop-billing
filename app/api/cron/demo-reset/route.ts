import { NextResponse } from "next/server";
import { reseedAllDemos } from "@/lib/demo";
import { isDemoType } from "@/lib/demo/config";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Called by Vercel Cron every night (see vercel.json): wipes and refills every demo shop,
 * so the "today" and "this week" in the demos are always current and nothing a visitor did
 * lasts. Protected by the same shared secret as the other cron jobs. `?type=hotel,gym`
 * refills only those (for a manual run). */
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const only = new URL(request.url).searchParams.get("type")?.split(",").filter(isDemoType);
  const results = await reseedAllDemos(only && only.length ? only : undefined);
  return NextResponse.json({ results });
}
