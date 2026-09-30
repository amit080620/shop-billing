import Link from "next/link";
import { hasPermission, requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getLang } from "@/lib/i18n/server";
import { NewBillClient } from "./NewBillClient";
import { getBarcodeScanModeAction } from "@/lib/actions/settings";
import { computeAffinityMap } from "@/lib/basketAffinity";
import { buyerSchemaReady } from "@/lib/gstBuyer";
import { quotationsReady } from "@/lib/quotationsData";
import { goldRatesFrom, loadRateRows, silverRateFrom } from "@/lib/metalRates";
import { goldSchemesReady, loadSchemes } from "@/lib/goldSchemeData";
import { todayIso } from "@/lib/dateHelpers";
import { salonExtrasReady } from "@/lib/salonExtras";
import { payrollReady } from "@/lib/payrollData";

export default async function NewBillPage({ searchParams }: { searchParams: Promise<{ customer?: string; provider?: string; quote?: string; scheme?: string }> }) {
  // Opened from an appointment ("Bill →"): that customer and stylist come filled in. Opened from a
  // quotation ("Make bill"): its lines, customer and discount.
  const { customer: customerParam, provider: providerParam, quote: quoteParam, scheme: schemeParam } = await searchParams;
  const session = await requireSession();
  const lang = await getLang();
  const barcodeScanMode = await getBarcodeScanModeAction();

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

  const admin = createSupabaseAdminClient();

  const last30 = new Date();
  last30.setDate(last30.getDate() - 30);

  const [{ data: products }, { data: customers }, { data: recentBills }, { data: shop }, { data: vehicles }, rateRows] = await Promise.all([
    admin
      .from("products")
      .select("id, name, price, offer_price, gst_percent, hsn_code, barcode, unit, track_inventory, stock_quantity, low_stock_threshold, requires_prescription, units_per_pack, loose_unit_name, metal_type, purity, making_charge_type, making_charge_value, wastage_percent, bulk_min_qty, bulk_price, hallmark_number")
      .eq("shop_id", session.shopId)
      .order("name"),
    admin
      .from("customers")
      .select("id, name, phone, gstin, state_code, loyalty_points")
      .eq("shop_id", session.shopId)
      .order("name"),
    admin
      .from("bills")
      .select("id")
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .gte("created_at", last30.toISOString()),
    admin.from("shops").select("invoice_prefix, loyalty_redemption_value, fast_billing_enabled").eq("id", session.shopId).single(),
    admin.from("vehicles").select("id, name, rate_per_km").eq("shop_id", session.shopId).eq("is_active", true).order("name"),
    // Today's rates — for gold, one per karat (see lib/metalRates).
    session.businessType === "jewellery" ? loadRateRows(admin, session.shopId) : Promise.resolve([]),
  ]);

  // "Frequently sold" quick-add chips — a real speed win for repeat items
  // (milk, bread, etc.) without typing anything.
  let frequentProductIds: string[] = [];
  const recentBillIds = (recentBills ?? []).map((b) => b.id);
  if (recentBillIds.length > 0) {
    const { data: items } = await admin.from("bill_items").select("product_id, quantity").in("bill_id", recentBillIds);
    const countByProduct = new Map<string, number>();
    for (const item of items ?? []) {
      if (!item.product_id) continue;
      countByProduct.set(item.product_id, (countByProduct.get(item.product_id) ?? 0) + Number(item.quantity));
    }
    frequentProductIds = [...countByProduct.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id]) => id);
  }

  // "Bought together" — the one product each item most often shares a
  // bill with, so adding rice can nudge atta the way a big e-commerce
  // cart would, except built from THIS shop's own real sales instead of
  // a platform-wide model. Shared with the low-stock "matched pair"
  // check on the dashboard, so both agree on what actually goes together.
  const affinityMap = await computeAffinityMap(admin, session.shopId);

  // Opened from a gold saving scheme ("Buy jewellery with it"): its value pays for the bill.
  const schemeView =
    session.businessType === "jewellery" && schemeParam && /^[0-9a-f-]{36}$/i.test(schemeParam) && (await goldSchemesReady(admin))
      ? (await loadSchemes(admin, session.shopId, { id: schemeParam }))[0]
      : undefined;
  const fromScheme =
    schemeView && schemeView.scheme.status === "active" && schemeView.figures.value > 0
      ? { id: schemeView.scheme.id, number: schemeView.scheme.scheme_number, value: schemeView.figures.value, complete: schemeView.figures.complete, customerId: schemeView.scheme.customer_id }
      : null;

  const quotationsAvailable = await quotationsReady(admin);
  // Salon: who can be picked as the stylist — the people on the payroll list.
  const { data: stylistRows } =
    session.businessType === "salon" && (await payrollReady(admin))
      ? await admin.from("workers").select("name").eq("shop_id", session.shopId).eq("is_active", true).order("name")
      : { data: [] };
  const { data: quote } =
    quotationsAvailable && quoteParam && /^[0-9a-f-]{36}$/i.test(quoteParam)
      ? await admin.from("quotations").select("id, quote_number, customer_id, items, discount_type, discount_value, status, valid_until").eq("id", quoteParam).eq("shop_id", session.shopId).maybeSingle()
      : { data: null };
  const fromQuote =
    quote && quote.status === "open"
      ? {
          id: quote.id,
          number: quote.quote_number,
          lines: quote.items,
          discountType: quote.discount_type,
          discountValue: Number(quote.discount_value),
          // While it is valid the quoted prices stand (the server keeps them too).
          honourPrices: !quote.valid_until || quote.valid_until >= todayIso(),
        }
      : null;

  return (
    <div className="flex flex-col gap-3">
      {shop?.fast_billing_enabled && (
        <Link
          href="/fast-billing"
          className="flex items-center gap-3 rounded-xl border border-brand bg-brand-soft px-4 py-3"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-base text-white">
            ⚡
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-brand-text">Fast Billing</p>
            <p className="text-xs text-muted">Skip the full form — tap items, get paid</p>
          </div>
          <span className="text-brand-text">→</span>
        </Link>
      )}
      <NewBillClient
        shopStateCode={session.shopStateCode}
        lang={lang}
        barcodeScanMode={barcodeScanMode}
        b2bAvailable={await buyerSchemaReady(admin)}
      loyaltyRedemptionValue={Number(shop?.loyalty_redemption_value ?? 1)}
      shopContext={{
        shopId: session.shopId,
        shopName: session.shopName,
        shopStateCode: session.shopStateCode,
        staffId: session.userId,
        staffName: session.staffName,
        invoicePrefix: shop?.invoice_prefix ?? "INV",
        priceIncludesGst: session.priceIncludesGst,
        gstScheme: session.gstScheme,
        canDiscount: hasPermission(session, "give_discounts"),
      }}
      products={(products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        // An offer price, while one is set, is what the counter charges (the server charges the same).
        price: p.offer_price != null && Number(p.offer_price) > 0 ? Number(p.offer_price) : Number(p.price),
        gstPercent: Number(p.gst_percent),
        hsnCode: p.hsn_code,
        barcode: p.barcode,
        unit: p.unit,
        trackInventory: p.track_inventory,
        stockQuantity: Number(p.stock_quantity),
        lowStockThreshold: Number(p.low_stock_threshold),
        requiresPrescription: p.requires_prescription,
        unitsPerPack: p.units_per_pack !== null ? Number(p.units_per_pack) : null,
        looseUnitName: p.loose_unit_name,
        metalType: p.metal_type,
        purity: p.purity,
        makingChargeType: p.making_charge_type,
        makingChargeValue: p.making_charge_value !== null ? Number(p.making_charge_value) : null,
        wastagePercent: p.wastage_percent !== null ? Number(p.wastage_percent) : null,
        bulkMinQty: p.bulk_min_qty !== null ? Number(p.bulk_min_qty) : null,
        bulkPrice: p.bulk_price !== null ? Number(p.bulk_price) : null,
        hallmarkNumber: p.hallmark_number,
      }))}
      customers={customers ?? []}
      frequentProductIds={frequentProductIds}
      affinityMap={affinityMap}
      vehicles={(vehicles ?? []).map((v) => ({ id: v.id, name: v.name, ratePerKm: Number(v.rate_per_km) }))}
      goldRates={goldRatesFrom(rateRows)}
      silverRate={silverRateFrom(rateRows)}
      businessType={session.businessType}
      initialCustomerId={(() => {
        const wanted = fromScheme ? fromScheme.customerId : fromQuote ? quote?.customer_id : customerParam;
        return wanted && (customers ?? []).some((c) => c.id === wanted) ? wanted : null;
      })()}
      quotationsAvailable={quotationsAvailable && !fromScheme}
      fromQuote={fromScheme ? null : fromQuote}
      fromScheme={fromScheme}
      stylists={(stylistRows ?? []).map((w) => w.name)}
      extrasAvailable={await salonExtrasReady(admin)}
      initialProvider={providerParam?.slice(0, 80) ?? ""}
    />
    </div>
  );
}
