import { INDIAN_STATES } from "./constants/states";
import type { createSupabaseAdminClient } from "./supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Who an invoice is made out to — its "Bill to". B2B exactly when `gstin` is set. */
export type Buyer = { name: string | null; gstin: string | null; address: string | null; state: string | null; stateCode: string | null };

/** A GSTIN's first two digits are the state it is registered in. */
export function stateFromGstin(gstin: string): { code: string; name: string | null } {
  const code = gstin.slice(0, 2);
  return { code, name: INDIAN_STATES.find((s) => s.code === code)?.name ?? null };
}

/** The state a customer or vendor is in for GST: the state its GSTIN is registered in when it has
 * one — that decides IGST vs CGST + SGST — else the state on its profile. */
export function partyStateCode(p: { gstin?: string | null; state_code?: string | null } | null | undefined): string | null {
  if (!p) return null;
  if (p.gstin && p.gstin.length >= 2) {
    const s = stateFromGstin(p.gstin);
    if (s.name) return s.code;
  }
  return p.state_code ?? null;
}

type CustomerLike = { name: string; gstin: string | null; address?: string | null; state: string | null; state_code: string | null };
type BuyerColumns = { buyer_name?: string | null; buyer_gstin?: string | null; buyer_address?: string | null; buyer_state?: string | null; buyer_state_code?: string | null };

/** The buyer printed on (and reported for) an invoice: what was frozen on the bill when it was
 * issued, and — for a bill made before that existed — the customer's details. */
export function buyerOf(row: BuyerColumns, customer: CustomerLike | null | undefined): Buyer | null {
  if (row.buyer_name != null || row.buyer_gstin != null) {
    return { name: row.buyer_name ?? null, gstin: row.buyer_gstin ?? null, address: row.buyer_address ?? null, state: row.buyer_state ?? null, stateCode: row.buyer_state_code ?? null };
  }
  if (!customer) return null;
  return { name: customer.name, gstin: customer.gstin, address: customer.address ?? null, state: customer.state, stateCode: customer.state_code };
}

let buyerColumnsReady = false;
/** Whether migration 0042 (buyer frozen on each bill, debit notes) has been applied. Until it has,
 * bills keep reading the customer's live details and the B2B switch stays hidden. */
export async function buyerSchemaReady(admin: Admin): Promise<boolean> {
  if (buyerColumnsReady) return true;
  const { error } = await admin.from("bills").select("buyer_gstin").limit(1);
  if (error) return false;
  buyerColumnsReady = true;
  return true;
}
