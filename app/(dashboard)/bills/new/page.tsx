import Link from "@/lib/link";
import { requireSession } from "@/lib/auth";
import { getLang } from "@/lib/i18n/server";
import { NewBillClient } from "./NewBillClient";
import { CachedNewBill } from "./CachedNewBill";
import { FastBillingBanner } from "./FastBillingBanner";
import { isPlainNewBill, loadNewBillScreen, type NewBillParams } from "@/lib/billing/newBillScreen";

export default async function NewBillPage({ searchParams }: { searchParams: Promise<NewBillParams> }) {
  // Opened from an appointment ("Bill →"): that customer and stylist come filled in. Opened from a
  // quotation ("Make bill"): its lines, customer and discount.
  const params = await searchParams;
  const session = await requireSession();

  if (!session.shopStateCode) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-10 text-center">
        <p className="text-sm text-muted">
          Add your shop&apos;s state in GST settings before billing — it decides whether a sale
          is CGST+SGST or IGST.
        </p>
        <Link href="/settings" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
          Go to settings
        </Link>
      </div>
    );
  }

  // A plain new bill opens at once from the copy kept on this phone, and refreshes it from the server
  // (/api/screens/new-bill) behind the scenes — no wait for the network at the counter.
  if (isPlainNewBill(params)) {
    return <CachedNewBill cacheKey={`new-bill:${session.shopId}:${session.userId}`} />;
  }

  // Opened to fill something in: built here as before, with what was asked for.
  const screen = await loadNewBillScreen({ ...session, shopStateCode: session.shopStateCode }, params, await getLang());
  return (
    <div className="flex flex-col gap-3">
      {screen.fastBillingEnabled && <FastBillingBanner />}
      <NewBillClient {...screen.props} />
    </div>
  );
}
