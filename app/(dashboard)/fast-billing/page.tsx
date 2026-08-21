import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FastBillingClient } from "./FastBillingClient";

export default async function FastBillingPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: shop } = await admin.from("shops").select("fast_billing_enabled").eq("id", session.shopId).single();
  if (!shop?.fast_billing_enabled) {
    redirect("/fast-billing-settings");
  }

  const { data: products } = await admin
    .from("products")
    .select("id, name, price, gst_percent, hsn_code, image_url, category_id, stock_quantity, track_inventory, categories ( name )")
    .eq("shop_id", session.shopId)
    .eq("show_in_fast_billing", true)
    .order("fast_billing_order", { ascending: true });

  const items = (products ?? []).map((p) => {
    const category = Array.isArray(p.categories) ? p.categories[0] : p.categories;
    return {
      id: p.id,
      name: p.name,
      price: Number(p.price),
      gstPercent: Number(p.gst_percent),
      hsnCode: p.hsn_code,
      imageUrl: p.image_url,
      categoryName: category?.name ?? null,
      trackInventory: p.track_inventory,
      stockQuantity: Number(p.stock_quantity),
    };
  });

  return <FastBillingClient products={items} shopStateCode={session.shopStateCode} businessType={session.businessType} />;
}
