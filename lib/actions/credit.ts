"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { getCustomerBalances } from "../moneyBalances";
import { gapsReady, GAPS_NOT_READY } from "../gapsData";

const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/** The customer's udhaar limit and what they owe now — New Bill warns before a sale takes them past it. */
export async function customerCreditAction(customerId: string): Promise<{ limit: number | null; balance: number }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  if (!isId(customerId) || !(await gapsReady(admin))) return { limit: null, balance: 0 };
  const { data: c } = await admin.from("customers").select("credit_limit").eq("id", customerId).eq("shop_id", session.shopId).maybeSingle();
  if (!c || c.credit_limit == null) return { limit: null, balance: 0 };
  const balances = await getCustomerBalances(admin, session.shopId, [customerId]);
  return { limit: Number(c.credit_limit), balance: Math.max(0, Math.round((balances.get(customerId) ?? 0) * 100) / 100) };
}

/** Sets (or clears, with null) how much udhaar this customer may run up. The owner's call. */
export async function setCreditLimitAction(customerId: string, limit: number | null): Promise<{ error?: string }> {
  const session = await requireSession();
  if (session.role !== "owner") return { error: "Only the owner can set an udhaar limit." };
  const admin = createSupabaseAdminClient();
  if (!(await gapsReady(admin))) return { error: GAPS_NOT_READY };
  if (!isId(customerId)) return { error: "Customer not found." };
  const value = limit == null ? null : Math.round(Number(limit) * 100) / 100;
  if (value != null && (!(value >= 0) || value > 100_000_000)) return { error: "Enter a limit in rupees." };
  const { error } = await admin.from("customers").update({ credit_limit: value }).eq("id", customerId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not save — try again." };
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return {};
}
