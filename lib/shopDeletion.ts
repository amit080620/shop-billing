import "server-only";
import type { createSupabaseAdminClient } from "./supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Tables whose rows point at a shop's bills, products, customers or vendors without cascading.
 * Deleting the shop in one statement fails as soon as any of them has a row (a single stock count
 * was enough to keep a demo shop down), so they are emptied first, in this order. */
const BLOCKING_TABLES = [
  "stock_audits",
  "batch_writeoffs",
  "table_order_requests",
  "returns",
  "jewellery_exchanges",
  "transport_trips",
  "appointments",
  "clinic_appointments",
  "restaurant_reservations",
  "restaurant_orders",
  "combos",
  "rentals",
  "service_jobs",
  "lab_orders",
  "prescriptions",
  "treatment_plans",
  "purchases",
  "bills",
] as const;

/** Clears everything that would block `delete from shops` for this shop. */
export async function emptyShopForDeletion(admin: Admin, shopId: string): Promise<void> {
  // A hotel stay and its bill point at each other; cut that link first.
  await admin.from("bills").update({ hotel_booking_id: null }).eq("shop_id", shopId).not("hotel_booking_id", "is", null);
  for (const table of BLOCKING_TABLES) {
    await admin.from(table).delete().eq("shop_id", shopId);
  }
}
