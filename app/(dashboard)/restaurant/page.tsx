import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { TablesClient } from "./TablesClient";

export default async function RestaurantPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const [{ data: tables }, { data: openOrders }] = await Promise.all([
    admin.from("restaurant_tables").select("id, name, status").eq("shop_id", session.shopId).order("name"),
    admin.from("restaurant_orders").select("id, table_id, total, created_at").eq("shop_id", session.shopId).eq("status", "open"),
  ]);

  const orderByTable = new Map((openOrders ?? []).map((o) => [o.table_id, o]));

  return (
    <TablesClient
      tables={(tables ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        openOrderId: orderByTable.get(t.id)?.id ?? null,
        openOrderTotal: orderByTable.get(t.id)?.total ? Number(orderByTable.get(t.id)!.total) : 0,
      }))}
    />
  );
}
