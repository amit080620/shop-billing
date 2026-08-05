import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { TablesClient } from "./TablesClient";

export default async function RestaurantPage() {
  const session = await requireSession();
  const { lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const [{ data: tables }, { data: openOrders }] = await Promise.all([
    admin.from("restaurant_tables").select("id, name, status").eq("shop_id", session.shopId).order("name"),
    admin.from("restaurant_orders").select("id, table_id, total, created_at").eq("shop_id", session.shopId).eq("status", "open"),
  ]);

  const orderByTable = new Map((openOrders ?? []).map((o) => [o.table_id, o]));

  const openOrderIds = (openOrders ?? []).map((o) => o.id);
  const { data: readyItems } = openOrderIds.length
    ? await admin.from("restaurant_order_items").select("order_id").in("order_id", openOrderIds).eq("status", "ready")
    : { data: [] };
  const readyCountByOrder = new Map<string, number>();
  for (const item of readyItems ?? []) {
    readyCountByOrder.set(item.order_id, (readyCountByOrder.get(item.order_id) ?? 0) + 1);
  }

  return (
    <TablesClient
      lang={lang}
      tables={(tables ?? []).map((t) => {
        const order = orderByTable.get(t.id);
        return {
          id: t.id,
          name: t.name,
          status: t.status,
          openOrderId: order?.id ?? null,
          openOrderTotal: order?.total ? Number(order.total) : 0,
          readyCount: order ? readyCountByOrder.get(order.id) ?? 0 : 0,
        };
      })}
    />
  );
}
