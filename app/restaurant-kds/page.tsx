import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { KdsClient } from "./KdsClient";

export default async function KdsPage() {
  const session = await requireSession();
  const { lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const { data: orders } = await admin
    .from("restaurant_orders")
    .select("id, order_number, created_at, restaurant_tables ( name ), restaurant_order_items ( id, product_name, quantity, status, created_at )")
    .eq("shop_id", session.shopId)
    .eq("status", "open")
    .order("created_at", { ascending: true });

  const tickets = (orders ?? []).map((o) => {
    const table = Array.isArray(o.restaurant_tables) ? o.restaurant_tables[0] : o.restaurant_tables;
    const items = Array.isArray(o.restaurant_order_items) ? o.restaurant_order_items : [];
    return {
      id: o.id,
      orderNumber: o.order_number,
      tableName: table?.name ?? "Table",
      createdAt: o.created_at,
      items: items
        .map((i) => ({ id: i.id, name: i.product_name, quantity: Number(i.quantity), status: i.status, createdAt: i.created_at }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    };
  });

  return <KdsClient shopName={session.shopName} initialTickets={tickets} lang={lang} />;
}
