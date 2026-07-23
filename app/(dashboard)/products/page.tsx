import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ProductsClient } from "./ProductsClient";

export default async function ProductsPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const [{ data: products }, { data: categories }] = await Promise.all([
    admin
      .from("products")
      .select(
        "id, name, price, gst_percent, hsn_code, unit, category_id, track_inventory, stock_quantity, low_stock_threshold, categories ( name )",
      )
      .eq("shop_id", session.shopId)
      .order("name"),
    admin
      .from("categories")
      .select("id, name")
      .eq("shop_id", session.shopId)
      .order("name"),
  ]);

  return (
    <ProductsClient
      initialProducts={(products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        gstPercent: Number(p.gst_percent),
        hsnCode: p.hsn_code,
        unit: p.unit,
        trackInventory: p.track_inventory,
        stockQuantity: Number(p.stock_quantity),
        lowStockThreshold: Number(p.low_stock_threshold),
        categoryId: p.category_id,
        categoryName: Array.isArray(p.categories)
          ? p.categories[0]?.name
          : (p.categories as { name: string } | null)?.name ?? null,
      }))}
      categories={(categories ?? []).map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
