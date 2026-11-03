import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { allRows } from "@/lib/supabase/allRows";
import { LabelsClient } from "./LabelsClient";

/** `?purchase=<id>` (from a saved purchase): one label per piece it brought in, filled in. */
export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ purchase?: string }> }) {
  const { purchase: purchaseId } = await searchParams;
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const [{ data: products }, fromPurchase] = await Promise.all([
    allRows((from, to) =>
      admin.from("products").select("id, name, price, mrp, unit, barcode").eq("shop_id", session.shopId).order("name").order("id").range(from, to),
    ),
    purchaseId ? purchaseLabels(admin, session.shopId, purchaseId) : null,
  ]);

  return (
    <LabelsClient
      shopName={session.shopName}
      products={(products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        mrp: p.mrp != null ? Number(p.mrp) : null,
        unit: p.unit,
        barcode: p.barcode,
      }))}
      fromPurchase={fromPurchase}
    />
  );
}

async function purchaseLabels(admin: ReturnType<typeof createSupabaseAdminClient>, shopId: string, purchaseId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(purchaseId)) return null;
  const { data: purchase } = await admin.from("purchases").select("id, vendor_invoice_number").eq("id", purchaseId).eq("shop_id", shopId).maybeSingle();
  if (!purchase) return null;
  const { data: items } = await admin.from("purchase_items").select("product_id, quantity, free_quantity").eq("purchase_id", purchase.id);
  const quantities: Record<string, number> = {};
  for (const i of items ?? []) {
    // Whole pieces only (a label per piece), at most 500 an item like the screen's own counter.
    if (i.product_id) quantities[i.product_id] = Math.min(500, (quantities[i.product_id] ?? 0) + Math.round(Number(i.quantity) + Number(i.free_quantity ?? 0)));
  }
  return { billNumber: purchase.vendor_invoice_number, quantities };
}
