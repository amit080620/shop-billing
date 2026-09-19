import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** The deploy id this server is running — polled by VersionWatcher. */
export function GET() {
  return NextResponse.json({ id: process.env.NEXT_PUBLIC_BUILD_ID }, { headers: { "Cache-Control": "no-store" } });
}
