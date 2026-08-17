"use server";

import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type ScannedMenuItem = { name: string; price: number; categoryName: string | null };

export async function createProductsFromScanAction(
  items: ScannedMenuItem[],
): Promise<{ error?: string; created?: number }> {
  const session = await requireSession();
  if (items.length === 0) return { error: "No items to add" };
  if (items.length > 60) return { error: "Too many items at once — scan in smaller batches (max 60)" };

  const admin = createSupabaseAdminClient();

  // Resolve/create categories by name, reusing existing ones with the
  // same name instead of making duplicates.
  const categoryNames = Array.from(
    new Set(items.map((i) => i.categoryName?.trim()).filter((c): c is string => !!c)),
  );
  const categoryIdByName = new Map<string, string>();
  if (categoryNames.length > 0) {
    const { data: existing } = await admin
      .from("categories")
      .select("id, name")
      .eq("shop_id", session.shopId)
      .in("name", categoryNames);
    for (const c of existing ?? []) categoryIdByName.set(c.name, c.id);

    const missing = categoryNames.filter((n) => !categoryIdByName.has(n));
    if (missing.length > 0) {
      const { data: newCats } = await admin
        .from("categories")
        .insert(missing.map((name) => ({ shop_id: session.shopId, name })))
        .select("id, name");
      for (const c of newCats ?? []) categoryIdByName.set(c.name, c.id);
    }
  }

  const rows = items.map((item) => ({
    shop_id: session.shopId,
    name: item.name.trim().slice(0, 120),
    price: Math.max(0, item.price),
    gst_percent: 0,
    unit: "NOS",
    category_id: item.categoryName ? categoryIdByName.get(item.categoryName.trim()) ?? null : null,
    show_in_catalog: true,
  }));

  const { error, count } = await admin.from("products").insert(rows, { count: "exact" });
  if (error) {
    console.error("Could not bulk-create products from scan", error);
    return { error: "Could not add these items — try again" };
  }

  revalidatePath("/products");
  return { created: count ?? rows.length };
}
