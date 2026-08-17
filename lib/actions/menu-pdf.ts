"use server";

import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type MenuPdfItem = { name: string; price: number; offerPrice: number | null };
export type MenuPdfCategory = { category: string; items: MenuPdfItem[] };

export async function getMenuForPdfAction(): Promise<{
  error?: string;
  shopName?: string;
  publicToken?: string | null;
  categories?: MenuPdfCategory[];
}> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: catalogSettings } = await admin
    .from("catalog_settings")
    .select("public_token, is_enabled")
    .eq("shop_id", session.shopId)
    .maybeSingle();

  const { data: products } = await admin
    .from("products")
    .select("name, price, offer_price, categories ( name )")
    .eq("shop_id", session.shopId)
    .eq("show_in_catalog", true)
    .order("name");

  const grouped = new Map<string, MenuPdfItem[]>();
  for (const p of products ?? []) {
    const catName =
      (Array.isArray(p.categories) ? p.categories[0]?.name : (p.categories as { name: string } | null)?.name) ??
      "Other";
    if (!grouped.has(catName)) grouped.set(catName, []);
    grouped.get(catName)!.push({
      name: p.name,
      price: Number(p.price),
      offerPrice: p.offer_price !== null ? Number(p.offer_price) : null,
    });
  }

  return {
    shopName: session.shopName,
    publicToken: catalogSettings?.is_enabled ? catalogSettings.public_token : null,
    categories: Array.from(grouped.entries()).map(([category, items]) => ({ category, items })),
  };
}
