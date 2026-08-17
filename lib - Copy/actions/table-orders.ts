"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { round2 } from "../gst";

export type PublicMenuItem = { id: string; name: string; price: number; category: string };

/** Resolves a QR token to a shop + table's public menu — no auth, since
 * this is what a customer's phone hits after scanning. Deliberately
 * returns only what a printed menu would show (name, price, category) —
 * nothing about stock, cost, GST, or any other shop data. */
export async function getTableMenuAction(
  qrToken: string,
): Promise<{ shopName?: string; tableName?: string; menu?: PublicMenuItem[]; hasPendingRequest?: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();

  const { data: table } = await admin
    .from("restaurant_tables")
    .select("id, name, shop_id, shops ( name )")
    .eq("qr_token", qrToken)
    .single();
  if (!table) return { error: "This QR code isn't valid — ask staff for a fresh one." };

  const shop = Array.isArray(table.shops) ? table.shops[0] : table.shops;

  const { data: products } = await admin
    .from("products")
    .select("id, name, price, categories ( name )")
    .eq("shop_id", table.shop_id)
    .order("name");

  const { data: pending } = await admin
    .from("table_order_requests")
    .select("id")
    .eq("table_id", table.id)
    .eq("status", "pending")
    .maybeSingle();

  return {
    shopName: shop?.name ?? "Restaurant",
    tableName: table.name,
    menu: (products ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price),
      category: Array.isArray(p.categories) ? p.categories[0]?.name ?? "Menu" : (p.categories as { name: string } | null)?.name ?? "Menu",
    })),
    hasPendingRequest: !!pending,
  };
}

export type RequestItemInput = { productId: string; quantity: number };

/** The only unauthenticated write in the app — deliberately narrow: it can
 * only create a *request* (never a real order/bill), only for the exact
 * table the QR code encodes, only one pending request at a time per
 * table (a simple, dependency-free anti-spam guard), and every price is
 * re-read from the product table server-side rather than trusted from
 * the client. */
export async function submitTableOrderRequestAction(
  qrToken: string,
  customerName: string,
  items: RequestItemInput[],
): Promise<{ error?: string; success?: boolean }> {
  if (items.length === 0) return { error: "Add at least one item" };
  if (items.length > 30) return { error: "That's a lot of items at once — please ask staff for help." };

  const admin = createSupabaseAdminClient();

  const { data: table } = await admin
    .from("restaurant_tables")
    .select("id, shop_id")
    .eq("qr_token", qrToken)
    .single();
  if (!table) return { error: "This QR code isn't valid — ask staff for a fresh one." };

  const { data: existingPending } = await admin
    .from("table_order_requests")
    .select("id")
    .eq("table_id", table.id)
    .eq("status", "pending")
    .maybeSingle();
  if (existingPending) {
    return { error: "There's already a request waiting for staff to review — please wait for that one first." };
  }

  const productIds = [...new Set(items.map((i) => i.productId))];
  const { data: products } = await admin
    .from("products")
    .select("id, name, price")
    .eq("shop_id", table.shop_id)
    .in("id", productIds);
  if (!products || products.length !== productIds.length) {
    return { error: "One or more items are no longer available — please refresh the menu." };
  }
  const productMap = new Map(products.map((p) => [p.id, p]));

  for (const item of items) {
    if (!item.quantity || item.quantity <= 0 || item.quantity > 50) {
      return { error: "Check the quantities and try again." };
    }
  }

  const { data: request, error } = await admin
    .from("table_order_requests")
    .insert({
      shop_id: table.shop_id,
      table_id: table.id,
      customer_name: customerName.trim().slice(0, 80) || null,
    })
    .select("id")
    .single();
  if (error || !request) {
    // The unique index on (table_id) where status='pending' is what
    // actually closes the race — this is the friendly message for when
    // it fires (someone else's scan landed a beat earlier).
    if (error?.code === "23505") {
      return { error: "There's already a request waiting for staff to review — please wait for that one first." };
    }
    console.error("Could not create table order request", error);
    return { error: "Could not send your request — please try again." };
  }

  const { error: itemsError } = await admin.from("table_order_request_items").insert(
    items.map((item) => {
      const product = productMap.get(item.productId)!;
      return {
        request_id: request.id,
        product_id: product.id,
        product_name: product.name,
        quantity: item.quantity,
        unit_price: round2(Number(product.price)),
      };
    }),
  );
  if (itemsError) {
    await admin.from("table_order_requests").delete().eq("id", request.id);
    return { error: "Could not send your request — please try again." };
  }

  return { success: true };
}

// ─── Staff-side review (authenticated) ────────────────────────────────────

export async function listPendingTableRequestsAction(): Promise<
  { id: string; tableId: string; tableName: string; customerName: string | null; createdAt: string; items: { name: string; quantity: number }[] }[]
> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: requests } = await admin
    .from("table_order_requests")
    .select("id, table_id, customer_name, created_at, restaurant_tables ( name )")
    .eq("shop_id", session.shopId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (!requests || requests.length === 0) return [];

  const requestIds = requests.map((r) => r.id);
  const { data: items } = await admin
    .from("table_order_request_items")
    .select("request_id, product_name, quantity")
    .in("request_id", requestIds);

  return requests.map((r) => {
    const table = Array.isArray(r.restaurant_tables) ? r.restaurant_tables[0] : r.restaurant_tables;
    return {
      id: r.id,
      tableId: r.table_id,
      tableName: table?.name ?? "Table",
      customerName: r.customer_name,
      createdAt: r.created_at,
      items: (items ?? []).filter((i) => i.request_id === r.id).map((i) => ({ name: i.product_name, quantity: Number(i.quantity) })),
    };
  });
}

export async function acceptTableOrderRequestAction(requestId: string): Promise<{ orderId?: string; error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: request } = await admin
    .from("table_order_requests")
    .select("id, table_id, status")
    .eq("id", requestId)
    .eq("shop_id", session.shopId)
    .single();
  if (!request) return { error: "Request not found" };
  if (request.status !== "pending") return { error: "Already handled" };

  const { data: items } = await admin
    .from("table_order_request_items")
    .select("product_id, product_name, quantity")
    .eq("request_id", requestId);

  // Find or start the table's open order — mirrors startOrderAction's
  // number-reservation logic so the accepted items land on a real,
  // properly-numbered order either way.
  let { data: order } = await admin
    .from("restaurant_orders")
    .select("id")
    .eq("table_id", request.table_id)
    .eq("status", "open")
    .maybeSingle();

  if (!order) {
    if (!session.shopStateCode) {
      return { error: "Add your shop's state in Settings before accepting orders." };
    }
    const now = new Date();
    const financialYear =
      now.getMonth() >= 3
        ? `${now.getFullYear()}-${String((now.getFullYear() + 1) % 100).padStart(2, "0")}`
        : `${now.getFullYear() - 1}-${String(now.getFullYear() % 100).padStart(2, "0")}`;
    const { data: issuedNumber } = await admin.rpc("next_restaurant_order_number", {
      p_shop_id: session.shopId,
      p_financial_year: financialYear,
    });
    const orderNumber = `${financialYear}/T${String(issuedNumber ?? 0).padStart(5, "0")}`;
    const { data: newOrder, error: orderError } = await admin
      .from("restaurant_orders")
      .insert({
        shop_id: session.shopId,
        table_id: request.table_id,
        staff_id: session.userId,
        order_number: orderNumber,
        financial_year: financialYear,
        supply_type: "intra",
      })
      .select("id")
      .single();
    if (orderError || !newOrder) return { error: "Could not start an order for this table" };
    order = newOrder;
    await admin.from("restaurant_tables").update({ status: "occupied" }).eq("id", request.table_id);
  }

  // Re-verify current prices/GST at accept time rather than trusting the
  // request's snapshot, in case the menu changed since the customer sent it.
  const productIds = [...new Set((items ?? []).map((i) => i.product_id))];
  const { data: currentProducts } = productIds.length
    ? await admin.from("products").select("id, price, gst_percent").in("id", productIds)
    : { data: [] };
  const currentByProduct = new Map((currentProducts ?? []).map((p) => [p.id, p]));

  const rows = (items ?? []).map((item) => {
    const current = currentByProduct.get(item.product_id);
    const unitPrice = current ? Number(current.price) : 0;
    const gstPercent = current ? Number(current.gst_percent) : 0;
    const lineTotal = round2(item.quantity * unitPrice);
    return {
      order_id: order!.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: unitPrice,
      gst_percent: gstPercent,
      line_subtotal: lineTotal,
      line_total: lineTotal,
    };
  });
  if (rows.length > 0) {
    await admin.from("restaurant_order_items").insert(rows);
  }

  await admin.from("table_order_requests").update({ status: "accepted", handled_at: new Date().toISOString() }).eq("id", requestId);

  revalidatePath("/restaurant");
  revalidatePath(`/restaurant/orders/${order.id}`);
  return { orderId: order.id };
}

export async function rejectTableOrderRequestAction(requestId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { data: request } = await admin
    .from("table_order_requests")
    .select("id, status")
    .eq("id", requestId)
    .eq("shop_id", session.shopId)
    .single();
  if (!request || request.status !== "pending") return { error: "Cannot reject" };

  await admin.from("table_order_requests").update({ status: "rejected", handled_at: new Date().toISOString() }).eq("id", requestId);
  revalidatePath("/restaurant");
  return {};
}

/** Renders a QR image for a table's order URL — the caller builds the full
 * URL client-side (window.location.origin + token) since the server can't
 * reliably know its own public domain across preview/custom deployments. */
export async function getTableQrImageAction(tableId: string, fullUrl: string): Promise<{ dataUrl?: string; error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { data: table } = await admin
    .from("restaurant_tables")
    .select("id, qr_token")
    .eq("id", tableId)
    .eq("shop_id", session.shopId)
    .single();
  if (!table) return { error: "Table not found" };
  if (!fullUrl.includes(table.qr_token)) return { error: "URL mismatch" };

  const { generateQrDataUrl } = await import("../qr");
  const dataUrl = await generateQrDataUrl(fullUrl);
  return { dataUrl };
}

export async function getTableQrTokenAction(tableId: string): Promise<{ qrToken?: string; error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { data: table } = await admin
    .from("restaurant_tables")
    .select("qr_token")
    .eq("id", tableId)
    .eq("shop_id", session.shopId)
    .single();
  if (!table) return { error: "Table not found" };
  return { qrToken: table.qr_token };
}
