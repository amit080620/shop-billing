import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getLang } from "@/lib/i18n/server";
import { NewBillClient } from "./NewBillClient";
import { getBarcodeScanModeAction } from "@/lib/actions/settings";

export default async function NewBillPage() {
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

  const [{ data: products }, { data: customers }, { data: recentBills }, { data: shop }, { data: vehicles }, { data: metalRates }] = await Promise.all([
    admin
      .from("products")
      .select("id, name, price, gst_percent, hsn_code, barcode, unit, track_inventory, stock_quantity, low_stock_threshold, requires_prescription, units_per_pack, loose_unit_name, metal_type, purity, making_charge_type, making_charge_value, wastage_percent, bulk_min_qty, bulk_price, hallmark_number")
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
    admin.from("metal_rates").select("metal_type, rate_per_gram, effective_date").eq("shop_id", session.shopId).order("effective_date", { ascending: false }).limit(20),
  ]);

  // "Frequently sold" quick-add chips — a real speed win for repeat items
  // (milk, bread, etc.) without typing anything.
  let frequentProductIds: string[] = [];
  // "Bought together" — the one product each item most often shares a
  // bill with, so adding rice can nudge atta the way a big e-commerce
  // cart would, except built from THIS shop's own real sales instead of
  // a platform-wide model. Reuses the same 30-day bill window as the
  // frequent-items chips above, just grouped by bill instead of summed.
  const affinityMap: Record<string, string> = {};
  const recentBillIds = (recentBills ?? []).map((b) => b.id);
  if (recentBillIds.length > 0) {
    const { data: items } = await admin
      .from("bill_items")
      .select("bill_id, product_id, quantity")
      .in("bill_id", recentBillIds);
    const countByProduct = new Map<string, number>();
    const itemsByBill = new Map<string, Set<string>>();
    for (const item of items ?? []) {
      if (!item.product_id) continue;
      countByProduct.set(item.product_id, (countByProduct.get(item.product_id) ?? 0) + Number(item.quantity));
      if (!itemsByBill.has(item.bill_id)) itemsByBill.set(item.bill_id, new Set());
      itemsByBill.get(item.bill_id)!.add(item.product_id);
    }
    frequentProductIds = [...countByProduct.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id]) => id);

    const billCountByProduct = new Map<string, number>();
    const pairCounts = new Map<string, number>();
    for (const productIds of itemsByBill.values()) {
      const ids = [...productIds];
      for (const id of ids) billCountByProduct.set(id, (billCountByProduct.get(id) ?? 0) + 1);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const [a, b] = [ids[i], ids[j]].sort();
          const key = `${a}|${b}`;
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    }
    const bestPartner = new Map<string, { partnerId: string; coCount: number }>();
    for (const [key, coCount] of pairCounts.entries()) {
      const [a, b] = key.split("|");
      for (const [x, y] of [[a, b] as const, [b, a] as const]) {
        const existing = bestPartner.get(x);
        if (!existing || coCount > existing.coCount) bestPartner.set(x, { partnerId: y, coCount });
      }
    }
    // Needs real signal, not a coincidence — co-bought at least 3 times
    // AND in at least a quarter of that product's own bills, or the
    // suggestion is noise more often than it's useful.
    for (const [productId, { partnerId, coCount }] of bestPartner.entries()) {
      const ownBills = billCountByProduct.get(productId) ?? 0;
      if (coCount >= 3 && ownBills > 0 && coCount / ownBills >= 0.25) {
        affinityMap[productId] = partnerId;
      }
    }
  }

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
      loyaltyRedemptionValue={Number(shop?.loyalty_redemption_value ?? 1)}
      shopContext={{
        shopId: session.shopId,
        shopName: session.shopName,
        shopStateCode: session.shopStateCode,
        staffId: session.userId,
        staffName: session.staffName,
        invoicePrefix: shop?.invoice_prefix ?? "INV",
        priceIncludesGst: session.priceIncludesGst,
      }}
      products={(products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
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
      goldRate={metalRates?.find((r) => r.metal_type === "gold") ? Number(metalRates.find((r) => r.metal_type === "gold")!.rate_per_gram) : null}
      silverRate={metalRates?.find((r) => r.metal_type === "silver") ? Number(metalRates.find((r) => r.metal_type === "silver")!.rate_per_gram) : null}
      businessType={session.businessType}
    />
    </div>
  );
}
