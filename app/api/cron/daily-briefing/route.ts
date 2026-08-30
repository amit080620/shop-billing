import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { computeBriefing } from "@/lib/actions/assistant";

export const maxDuration = 300; // this genuinely needs to process every shop, not just one request

/** Called by Vercel Cron (see vercel.json) once a day — never by a
 * person, never by the app's own UI. Protected by a shared secret so
 * a guessed URL can't trigger it: Vercel's own cron invocations send
 * this automatically as a bearer token; anyone else's request is
 * rejected outright. */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ skipped: "Assistant AI not configured" });

  const admin = createSupabaseAdminClient();
  const { data: shops } = await admin.from("shops").select("id");
  const today = new Date().toISOString().slice(0, 10);

  let processed = 0;
  let failed = 0;

  // Sequential, deliberately — a burst of concurrent Gemini calls
  // (one per shop) risks tripping the free tier's per-minute rate
  // limit for a shop count where that matters; overnight has plenty
  // of time to spare, unlike a live request a person is waiting on.
  for (const shop of shops ?? []) {
    try {
      const { message, overdueCount, lowStockCount } = await computeBriefing(shop.id, apiKey);
      await admin
        .from("daily_briefings")
        .upsert(
          { shop_id: shop.id, briefing_date: today, message, overdue_count: overdueCount, low_stock_count: lowStockCount },
          { onConflict: "shop_id,briefing_date" },
        );
      processed++;
    } catch (err) {
      console.error("Overnight briefing failed for shop", shop.id, err);
      failed++;
    }
  }

  return NextResponse.json({ date: today, shopsTotal: shops?.length ?? 0, processed, failed });
}
