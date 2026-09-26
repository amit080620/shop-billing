import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { KdsClient } from "./KdsClient";
import { LangProvider } from "@/lib/i18n/LangContext";
import { messagesFor } from "@/lib/i18n/dictionary";

export default async function KdsPage() {
  const session = await requireSession();
  const { lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  let ordersQuery = admin
    .from("restaurant_orders")
    .select("id, order_number, created_at, revised_at, restaurant_tables ( name ), restaurant_order_items ( id, product_name, quantity, status, created_at, selected_modifiers )")
    .eq("shop_id", session.shopId);
  if (session.businessType === "hotel") {
    // A room's order is charged to the guest's account as soon as it is taken, so it
    // leaves "open" at once — keep it on the kitchen screen until its items are ready.
    const since = new Date(Date.now() - 18 * 3600 * 1000).toISOString();
    ordersQuery = ordersQuery.or(`status.eq.open,and(status.eq.settled,hotel_booking_id.not.is.null,settled_at.gte.${since})`);
  } else {
    ordersQuery = ordersQuery.eq("status", "open");
  }
  const { data: orders } = await ordersQuery.order("created_at", { ascending: true });

  const tickets = (orders ?? []).map((o) => {
    const table = Array.isArray(o.restaurant_tables) ? o.restaurant_tables[0] : o.restaurant_tables;
    const items = Array.isArray(o.restaurant_order_items) ? o.restaurant_order_items : [];
    return {
      id: o.id,
      orderNumber: o.order_number,
      tableName: table?.name ?? "Table",
      createdAt: o.created_at,
      revisedAt: o.revised_at,
      items: items
        .map((i) => ({ id: i.id, name: i.product_name, quantity: Number(i.quantity), status: i.status, createdAt: i.created_at, modifiers: i.selected_modifiers }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    };
  });

  const { data: kdsSettings } = await admin.from("kds_settings").select("columns, font_scale").eq("shop_id", session.shopId).maybeSingle();

  return (
    <LangProvider lang={lang} messages={messagesFor(lang)}>
      <KdsClient
        shopName={session.shopName}
        initialTickets={tickets}
        lang={lang}
        columns={kdsSettings?.columns ?? 3}
        fontScale={kdsSettings?.font_scale ?? "normal"}
      />
    </LangProvider>
  );
}
