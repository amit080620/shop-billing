import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CombosClient } from "./CombosClient";

export default async function CombosPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const [{ data: products }, { data: combos }] = await Promise.all([
    admin.from("products").select("id, name, price").eq("shop_id", session.shopId).order("name"),
    admin.from("combos").select("id, name, price, gst_percent, is_active").eq("shop_id", session.shopId).order("created_at", { ascending: false }),
  ]);

  const comboIds = (combos ?? []).map((c) => c.id);
  const { data: comboItems } = comboIds.length
    ? await admin.from("combo_items").select("combo_id, product_name, quantity").in("combo_id", comboIds)
    : { data: [] };
  const itemsByCombo = new Map<string, { name: string; quantity: number }[]>();
  for (const item of comboItems ?? []) {
    const list = itemsByCombo.get(item.combo_id) ?? [];
    list.push({ name: item.product_name, quantity: Number(item.quantity) });
    itemsByCombo.set(item.combo_id, list);
  }

  return (
    <CombosClient
      products={(products ?? []).map((p) => ({ id: p.id, name: p.name, price: Number(p.price) }))}
      combos={(combos ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        price: Number(c.price),
        gstPercent: Number(c.gst_percent),
        isActive: c.is_active,
        items: itemsByCombo.get(c.id) ?? [],
      }))}
    />
  );
}
