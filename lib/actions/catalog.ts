"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { round2 } from "../gst";
import { logError } from "../audit";

export async function saveCatalogSettingsAction(settings: {
  isEnabled: boolean;
  bannerText: string;
}): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("catalog_settings").upsert({
    shop_id: session.shopId,
    is_enabled: settings.isEnabled,
    banner_text: settings.bannerText || null,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Could not save catalog settings", error);
    return { error: "Could not save settings" };
  }
  revalidatePath("/catalog-settings");
  return {};
}

type CartItemInput = { productId: string; quantity: number };

/** No requireSession() — a customer browsing a shop's public catalog link
 * has no account and shouldn't need one. Prices are re-verified from the
 * real product catalog server-side (never trusted from the client), same
 * defensive pattern as the QR table-ordering flow. */
export async function submitCatalogOrderAction(
  publicToken: string,
  input: { name: string; phone: string; notes: string; items: CartItemInput[] },
): Promise<{ error?: string }> {
  const admin = createSupabaseAdminClient();

  if (!input.name.trim()) return { error: "Enter your name" };
  if (!input.phone.trim()) return { error: "Enter your phone number" };
  if (input.items.length === 0) return { error: "Your cart is empty" };

  const { data: settings } = await admin
    .from("catalog_settings")
    .select("shop_id, is_enabled")
    .eq("public_token", publicToken)
    .maybeSingle();
  if (!settings || !settings.is_enabled) return { error: "Ordering is not available right now" };

  const productIds = input.items.map((i) => i.productId);
  const { data: products } = await admin
    .from("products")
    .select("id, name, price, offer_price, show_in_catalog")
    .eq("shop_id", settings.shop_id)
    .in("id", productIds);
  const productById = new Map((products ?? []).map((p) => [p.id, p]));

  const { data: request, error } = await admin
    .from("catalog_order_requests")
    .insert({
      shop_id: settings.shop_id,
      customer_name: input.name.trim(),
      customer_phone: input.phone.trim(),
      notes: input.notes.trim() || null,
    })
    .select("id")
    .single();
  if (error || !request) {
    console.error("Could not create catalog order request", error);
    return { error: "Could not send your order — please try again." };
  }

  const rows = input.items
    .map((item) => {
      const product = productById.get(item.productId);
      if (!product || !product.show_in_catalog) return null;
      const price = product.offer_price ? Number(product.offer_price) : Number(product.price);
      return {
        request_id: request.id,
        product_id: product.id,
        product_name: product.name,
        quantity: item.quantity,
        price_at_request: price,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) {
    await admin.from("catalog_order_requests").delete().eq("id", request.id);
    return { error: "None of the items in your cart are available anymore" };
  }

  const { error: itemsError } = await admin.from("catalog_order_request_items").insert(rows);
  if (itemsError) {
    console.error("Could not save catalog order items", itemsError);
    await admin.from("catalog_order_requests").delete().eq("id", request.id);
    return { error: "Could not send your order — please try again." };
  }

  return {};
}

export async function rejectCatalogOrderAction(requestId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("catalog_order_requests")
    .update({ status: "rejected" })
    .eq("id", requestId)
    .eq("shop_id", session.shopId);
  if (error) return { error: "Could not update request" };
  revalidatePath("/catalog-orders");
  return {};
}

/** Accepting converts the request into a real bill through the same
 * billing engine every other vertical uses — customer's requested
 * quantities become real line items at the price shown when they
 * ordered, verified once more against current stock/price so nothing
 * stale slips through. */
export async function acceptCatalogOrderAction(
  requestId: string,
  paymentMethod: "cash" | "card" | "upi" | "online" | "other",
): Promise<{ error?: string; billId?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: request } = await admin
    .from("catalog_order_requests")
    .select("id, status, customer_name, customer_phone")
    .eq("id", requestId)
    .eq("shop_id", session.shopId)
    .single();
  if (!request) return { error: "Request not found" };
  if (request.status !== "pending") return { error: "This request was already handled" };

  const { data: items } = await admin
    .from("catalog_order_request_items")
    .select("product_id, product_name, quantity, price_at_request")
    .eq("request_id", requestId);
  if (!items || items.length === 0) return { error: "No items on this order" };

  const { data: products } = await admin
    .from("products")
    .select("id, gst_percent, hsn_code")
    .eq("shop_id", session.shopId)
    .in(
      "id",
      items.map((i) => i.product_id).filter((id): id is string => !!id),
    );
  const productById = new Map((products ?? []).map((p) => [p.id, p]));

  const { createBillCore } = await import("./bills");
  const result = await createBillCore(session, {
    customerId: null,
    items: items.map((item) => {
      const product = item.product_id ? productById.get(item.product_id) : undefined;
      return {
        productId: item.product_id,
        description: item.product_name,
        hsnCode: product?.hsn_code ?? null,
        quantity: round2(Number(item.quantity)),
        unitPrice: Number(item.price_at_request),
        gstPercent: product ? Number(product.gst_percent) : 0,
      };
    }),
    discountType: "flat",
    discountValue: 0,
    paidAmount: 0,
    paymentMethod,
  });
  if ("error" in result) return { error: result.error };

  const { error: linkError } = await admin
    .from("catalog_order_requests")
    .update({ status: "accepted", bill_id: result.billId })
    .eq("id", requestId)
    .eq("shop_id", session.shopId);
  if (linkError) {
    console.error("Could not link bill to catalog order", linkError);
    await logError({ shopId: session.shopId, context: "catalog.acceptOrderAction", message: "Could not link invoice to catalog order", details: { requestId, billId: result.billId, error: linkError.message } });
    await admin
      .from("bills")
      .update({ status: "voided", voided_at: new Date().toISOString(), void_reason: "Automatic: could not link invoice to catalog order" })
      .eq("id", result.billId);
    return { error: "Could not finish accepting this order — the invoice was voided automatically. Please try again." };
  }

  revalidatePath("/catalog-orders");
  return { billId: result.billId };
}
