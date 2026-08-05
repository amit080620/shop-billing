import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { OrderClient } from "./OrderClient";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { lang } = await getTranslator();
  const { id } = await params;
  const admin = createSupabaseAdminClient();

  const { data: order } = await admin
    .from("restaurant_orders")
    .select("*, restaurant_tables ( name )")
    .eq("id", id)
    .eq("shop_id", session.shopId)
    .single();

  if (!order) {
    return <p className="text-sm text-muted">Order not found.</p>;
  }

  const [{ data: items }, { data: products }] = await Promise.all([
    admin.from("restaurant_order_items").select("*").eq("order_id", id).order("created_at"),
    admin.from("products").select("id, name, price, gst_percent, category_id, categories ( name )").eq("shop_id", session.shopId).order("name"),
  ]);

  const table = Array.isArray(order.restaurant_tables) ? order.restaurant_tables[0] : order.restaurant_tables;

  return (
    <OrderClient
      shopName={session.shopName}
      lang={lang}
      order={{
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        subtotal: Number(order.subtotal),
        discountAmount: Number(order.discount_amount),
        cgstAmount: Number(order.cgst_amount),
        sgstAmount: Number(order.sgst_amount),
        igstAmount: Number(order.igst_amount),
        total: Number(order.total),
        tableName: table?.name ?? "Table",
        orderType: order.order_type,
      }}
      items={(items ?? []).map((i) => ({
        id: i.id,
        productName: i.product_name,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unit_price),
        lineTotal: Number(i.line_total),
      }))}
      products={(products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        category: Array.isArray(p.categories) ? p.categories[0]?.name ?? "Other" : (p.categories as { name: string } | null)?.name ?? "Other",
      }))}
    />
  );
}
