import { requireSession } from "@/lib/auth";
import { getLang } from "@/lib/i18n/server";
import { loadNewBillScreen } from "@/lib/billing/newBillScreen";

/** A fresh copy of the plain New Bill screen, for the phone to show and keep (CachedNewBill). */
export async function GET() {
  const session = await requireSession();
  if (!session.shopStateCode) return Response.json({ error: "no-state" }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
  const screen = await loadNewBillScreen({ ...session, shopStateCode: session.shopStateCode }, {}, await getLang());
  return Response.json({ shop: session.shopId, screen }, { headers: { "Cache-Control": "private, no-store" } });
}
