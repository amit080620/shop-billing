import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { TablesClient } from "./TablesClient";

export default async function RestaurantPage() {
  const session = await requireSession();
  const { lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const todayIso = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;

  const tablesQuery = await admin.from("restaurant_tables").select("id, name, status, section, qr_token").eq("shop_id", session.shopId).eq("is_deleted", false).order("name");
  let tables = tablesQuery.data;
  if (tablesQuery.error) {
    // Most likely cause: the `section` column migration
    // (0002_restaurant_table_section.sql) hasn't been run against this
    // database yet. Retry without it so the Tables screen still works;
    // the I/O/T badges just won't show until the migration runs.
    console.error("restaurant_tables query failed, retrying without `section`:", tablesQuery.error);
    const fallback = await admin.from("restaurant_tables").select("id, name, status, qr_token").eq("shop_id", session.shopId).eq("is_deleted", false).order("name");
    tables = (fallback.data ?? []).map((t) => ({ ...t, section: null as "inside" | "outside" | "takeaway" | null }));
  }

  const [{ data: openOrders }, { data: reservations }] = await Promise.all([
    admin.from("restaurant_orders").select("id, table_id, total, created_at").eq("shop_id", session.shopId).eq("status", "open"),
    admin
      .from("restaurant_reservations")
      .select("id, table_id, customer_name, reservation_time, party_size")
      .eq("shop_id", session.shopId)
      .eq("reservation_date", todayIso)
      .in("status", ["booked", "confirmed"])
      .not("table_id", "is", null),
  ]);

  const orderByTable = new Map((openOrders ?? []).map((o) => [o.table_id, o]));
  const reservationByTable = new Map((reservations ?? []).map((r) => [r.table_id, r]));

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
        const reservation = reservationByTable.get(t.id);
        return {
          id: t.id,
          name: t.name,
          status: t.status,
          section: t.section,
          openOrderId: order?.id ?? null,
          openOrderTotal: order?.total ? Number(order.total) : 0,
          qrToken: t.qr_token,
          readyCount: order ? readyCountByOrder.get(order.id) ?? 0 : 0,
          reservation: reservation
            ? { customerName: reservation.customer_name, time: reservation.reservation_time, partySize: reservation.party_size }
            : null,
        };
      })}
    />
  );
}
