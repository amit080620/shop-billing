import "server-only";
import type { createSupabaseAdminClient } from "./supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Tables whose rows point at a shop's bills, products, customers or vendors without cascading.
 * Deleting the shop in one statement fails as soon as any of them has a row (a single stock count
 * was enough to keep a demo shop down), so they are emptied first, in this order.
 * The godown ledger's papers (migration 0063) come first: a return's placement (return_dispositions,
 * also written by a van's shop return) holds its return and return lines, damage reports and
 * transfers hold their godown, and godown stock refuses to let its godown go — on 2026-11-07 one van
 * return kept the wholesale demo from being refreshed. */
export const BLOCKING_TABLES = [
  "return_dispositions",
  "purchase_returns",
  "stock_discrepancies",
  "stock_transfers",
  "godown_moves",
  "damage_reports",
  "godown_counts",
  "godown_stock",
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
