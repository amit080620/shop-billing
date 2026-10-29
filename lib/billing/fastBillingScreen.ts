import "server-only";
import type { ComponentProps } from "react";
import { hasPermission, type SessionContext } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { allRows } from "@/lib/supabase/allRows";
import type { Lang } from "@/lib/i18n/dictionary";
import type { FastBillingClient } from "@/app/(dashboard)/fast-billing/FastBillingClient";

export type FastBillingProps = ComponentProps<typeof FastBillingClient>;
/** null props: the shop hasn't switched Fast Billing on (its settings page explains how). */
export type FastBillingScreen = { props: FastBillingProps | null };

/** Everything the Fast Billing counter shows, for one shop. */
export async function loadFastBillingScreen(session: SessionContext, lang: Lang): Promise<FastBillingScreen> {
  const admin = createSupabaseAdminClient();

  let fastBillingEnabled = false;
  let loyaltyRedemptionValue = 1;
  try {
    const { data: shop } = await admin.from("shops").select("fast_billing_enabled, loyalty_redemption_value").eq("id", session.shopId).single();
    fastBillingEnabled = shop?.fast_billing_enabled ?? false;
    loyaltyRedemptionValue = Number(shop?.loyalty_redemption_value ?? 1);
  } catch (err) {
    console.error("Could not check fast_billing_enabled", err);
  }
  if (!fastBillingEnabled) return { props: null };

  const { data: products } = await allRows((from, to) =>
    admin
      .from("products")
      .select("id, name, price, offer_price, bulk_min_qty, bulk_price, gst_percent, hsn_code, image_url, category_id, stock_quantity, track_inventory, categories ( name )")
      .eq("shop_id", session.shopId)
      .eq("show_in_fast_billing", true)
      .order("fast_billing_order", { ascending: true })
      .order("id")
      .range(from, to),
  );

  const items = (products ?? []).map((p) => {
    const category = Array.isArray(p.categories) ? p.categories[0] : p.categories;
    return {
      id: p.id,
      name: p.name,
      // The price the counter charges — the offer price while one is set (the server charges the same).
      price: p.offer_price != null && Number(p.offer_price) > 0 ? Number(p.offer_price) : Number(p.price),
      bulkMinQty: p.bulk_min_qty != null ? Number(p.bulk_min_qty) : null,
      bulkPrice: p.bulk_price != null ? Number(p.bulk_price) : null,
      gstPercent: Number(p.gst_percent),
      hsnCode: p.hsn_code,
      imageUrl: p.image_url,
      categoryName: category?.name ?? null,
      trackInventory: p.track_inventory,
      stockQuantity: Number(p.stock_quantity),
    };
  });

  return {
    props: {
      products: items,
      loyaltyRedemptionValue,
      priceIncludesGst: session.priceIncludesGst,
      gstScheme: session.gstScheme,
      canDiscount: hasPermission(session, "give_discounts"),
      shopId: session.shopId,
      lang,
    },
  };
}
