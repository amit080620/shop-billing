import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getLang } from "@/lib/i18n/server";
import { NewBillClient } from "./NewBillClient";

export default async function NewBillPage() {
  const session = await requireSession();
  const lang = await getLang();

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

  const [{ data: products }, { data: customers }, { data: recentBills }, { data: shop }] = await Promise.all([
    admin
      .from("products")
      .select("id, name, price, gst_percent, hsn_code, barcode, unit, track_inventory, stock_quantity, low_stock_threshold, requires_prescription, units_per_pack, loose_unit_name")
      .eq("shop_id", session.shopId)
      .order("name"),
    admin
      .from("customers")
      .select("id, name, phone, gstin, state_code")
      .eq("shop_id", session.shopId)
      .order("name"),
    admin
      .from("bills")
      .select("id")
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .gte("created_at", last30.toISOString()),
    admin.from("shops").select("invoice_prefix").eq("id", session.shopId).single(),
  ]);

  // "Frequently sold" quick-add chips — a real speed win for repeat items
  // (milk, bread, etc.) without typing anything.
  let frequentProductIds: string[] = [];
  const recentBillIds = (recentBills ?? []).map((b) => b.id);
  if (recentBillIds.length > 0) {
    const { data: items } = await admin
      .from("bill_items")
      .select("product_id, quantity")
      .in("bill_id", recentBillIds);
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

  return (
    <NewBillClient
      shopStateCode={session.shopStateCode}
      lang={lang}
      shopContext={{
        shopId: session.shopId,
        shopName: session.shopName,
        shopStateCode: session.shopStateCode,
        staffId: session.userId,
        staffName: session.staffName,
        invoicePrefix: shop?.invoice_prefix ?? "INV",
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
      }))}
      customers={customers ?? []}
      frequentProductIds={frequentProductIds}
    />
  );
}
