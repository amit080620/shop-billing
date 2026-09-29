import type { createSupabaseAdminClient } from "./supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type CashMethod = "cash" | "card" | "upi" | "online" | "other";
export type CashMovementKind = "advance_received" | "advance_applied" | "refund_given";
export type CashMovementSource = "service_job" | "reservation" | "rental" | "item_request" | "gold_scheme";

export function asCashMethod(value: unknown): CashMethod {
  return value === "card" || value === "upi" || value === "online" || value === "other" ? value : "cash";
}

let tableReady = false;
/** Whether migration 0043 (cash_movements) has been applied. Until it has, advances are counted
 * the old way (on the day of the final bill) and nothing is written. */
export async function cashMovementsReady(admin: Admin): Promise<boolean> {
  if (tableReady) return true;
  const { error } = await admin.from("cash_movements").select("id").limit(1);
  if (error) return false;
  tableReady = true;
  return true;
}

/** Records money that changed hands outside a bill. Never throws: the sale, booking or job it
 * belongs to has already been saved, and must not fail over its drawer entry. */
export async function recordCashMovement(
  admin: Admin,
  row: { shopId: string; staffId: string | null; kind: CashMovementKind; source: CashMovementSource; sourceId: string; method: CashMethod; amount: number; note?: string },
): Promise<void> {
  if (!row.amount || !(await cashMovementsReady(admin))) return;
  try {
    await admin.from("cash_movements").insert({
      shop_id: row.shopId,
      staff_id: row.staffId,
      kind: row.kind,
      source: row.source,
      source_id: row.sourceId,
      payment_method: row.method,
      amount: Math.round(row.amount * 100) / 100,
      note: row.note ?? null,
    });
  } catch (error) {
    console.error("Could not record cash movement", error);
  }
}

/** The advance taken earlier for this job or booking, as recorded then (null when it was taken
 * before advances were recorded — then nothing is taken off again later). */
export async function advanceReceived(admin: Admin, source: CashMovementSource, sourceId: string): Promise<{ amount: number; method: CashMethod } | null> {
  if (!(await cashMovementsReady(admin))) return null;
  const { data } = await admin
    .from("cash_movements")
    .select("amount, payment_method")
    .eq("source", source)
    .eq("source_id", sourceId)
    .eq("kind", "advance_received");
  if (!data?.length) return null;
  return { amount: data.reduce((s, r) => s + Number(r.amount), 0), method: asCashMethod(data[0].payment_method) };
}

/** Whether a movement of this kind was already written for this job or booking (so a repeated
 * tap never counts the same money twice). */
export async function hasCashMovement(admin: Admin, source: CashMovementSource, sourceId: string, kind: CashMovementKind): Promise<boolean> {
  if (!(await cashMovementsReady(admin))) return false;
  const { count } = await admin.from("cash_movements").select("id", { count: "exact", head: true }).eq("source", source).eq("source_id", sourceId).eq("kind", kind);
  return (count ?? 0) > 0;
}
