import { requireSession } from "@/lib/auth";
import { getLang } from "@/lib/i18n/server";
import { loadFastBillingScreen } from "@/lib/billing/fastBillingScreen";

/** A fresh copy of the Fast Billing counter, for the phone to show and keep (CachedFastBilling). */
export async function GET() {
  const session = await requireSession();
  const screen = await loadFastBillingScreen(session, await getLang());
  return Response.json({ shop: session.shopId, screen }, { headers: { "Cache-Control": "private, no-store" } });
}
