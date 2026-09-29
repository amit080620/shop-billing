"use server";

import { revalidatePath } from "next/cache";
import { requireOwner, requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { logAuditEvent } from "../audit";
import { financialYearFor } from "../gst";
import { todayIso } from "../dateHelpers";
import { findOrCreateCustomerByPhone } from "./customers";
import { recordCashMovement } from "../cashMovements";
import { goldSchemesReady, loadSchemes } from "../goldSchemeData";

type Method = "cash" | "card" | "upi" | "online" | "other";
const NOT_READY = "Gold schemes need a one-time database update — ask the owner to run migration 0047.";

function refresh(id?: string) {
  revalidatePath("/jewellery/schemes");
  if (id) revalidatePath(`/jewellery/schemes/${id}`);
  revalidatePath("/daily-summary");
}

/** Starts a scheme for a customer, usually with the first instalment paid there and then. */
export async function createGoldSchemeAction(input: {
  customerId: string | null;
  name: string;
  phone: string;
  installmentAmount: number;
  totalInstallments: number;
  bonusAmount: number;
  firstPayment: { method: Method } | null;
  notes: string;
}): Promise<{ error?: string; schemeId?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  if (!(await goldSchemesReady(admin))) return { error: NOT_READY };

  const installment = Math.round(Number(input.installmentAmount) * 100) / 100;
  const months = Math.round(Number(input.totalInstallments));
  const bonus = Math.max(0, Math.round(Number(input.bonusAmount) * 100) / 100);
  if (!(installment > 0)) return { error: "Enter the monthly instalment" };
  if (!(months >= 1 && months <= 60)) return { error: "Instalments must be between 1 and 60" };

  let customerId = input.customerId;
  let name = input.name.trim();
  let phone = input.phone.replace(/\D/g, "").slice(-10);
  if (customerId) {
    const { data: c } = await admin.from("customers").select("id, name, phone").eq("id", customerId).eq("shop_id", session.shopId).maybeSingle();
    if (!c) return { error: "Customer not found" };
    name = c.name;
    phone = c.phone ?? phone;
  } else {
    if (!name) return { error: "Enter the customer's name" };
    if (phone.length !== 10) return { error: "Enter the customer's 10-digit phone number" };
    const linked = await findOrCreateCustomerByPhone(admin, session.shopId, phone, name);
    customerId = linked?.id ?? null;
  }

  const financialYear = financialYearFor(new Date());
  const { data: n, error: numberError } = await admin.rpc("next_gold_scheme_number", { p_shop_id: session.shopId, p_financial_year: financialYear });
  if (numberError || n == null) return { error: "Could not number the scheme — try again." };

  const { data: scheme, error } = await admin
    .from("gold_schemes")
    .insert({
      shop_id: session.shopId,
      scheme_number: `GS/${financialYear}/${String(n).padStart(5, "0")}`,
      customer_id: customerId,
      customer_name: name,
      customer_phone: phone || null,
      installment_amount: installment,
      total_installments: months,
      bonus_amount: bonus,
      start_date: todayIso(),
      notes: input.notes.trim().slice(0, 300) || null,
      staff_id: session.userId,
    })
    .select("id, scheme_number")
    .single();
  if (error || !scheme) return { error: "Could not start the scheme — try again." };

  if (input.firstPayment) {
    const r = await addInstallment(admin, session.shopId, session.userId, scheme.id, scheme.scheme_number, installment, input.firstPayment.method);
    if (r.error) return { error: r.error, schemeId: scheme.id };
  }
  refresh(scheme.id);
  return { schemeId: scheme.id };
}

async function addInstallment(admin: ReturnType<typeof createSupabaseAdminClient>, shopId: string, staffId: string, schemeId: string, schemeNumber: string, amount: number, method: Method) {
  const { data: row, error } = await admin.from("gold_scheme_payments").insert({ shop_id: shopId, scheme_id: schemeId, amount, payment_method: method, staff_id: staffId }).select("id").single();
  if (error || !row) return { error: "Could not save the instalment — try again." };
  // Money in today, like any advance (the Daily summary shows it; redemption takes it off later).
  await recordCashMovement(admin, { shopId, staffId, kind: "advance_received", source: "gold_scheme", sourceId: schemeId, method, amount, note: `Instalment — scheme ${schemeNumber}` });
  return {};
}

/** Takes an instalment (or several at once) for a running scheme. */
export async function recordSchemeInstallmentAction(schemeId: string, amount: number, method: Method): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  if (!(await goldSchemesReady(admin))) return { error: NOT_READY };
  const [view] = await loadSchemes(admin, session.shopId, { id: schemeId });
  if (!view) return { error: "Scheme not found" };
  if (view.scheme.status !== "active") return { error: "This scheme is already closed." };
  const value = Math.round(Number(amount) * 100) / 100;
  if (!(value > 0)) return { error: "Enter the amount" };
  if (value > view.figures.remaining + 0.005) return { error: `Only ${view.figures.remaining} is left to pay on this scheme.` };
  const r = await addInstallment(admin, session.shopId, session.userId, schemeId, view.scheme.scheme_number, value, method);
  if (r.error) return r;
  refresh(schemeId);
  return {};
}

/** Ends a scheme early and hands money back — owner only, and written to the audit log. */
export async function closeSchemeAction(schemeId: string, refund: number, method: Method): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();
  if (!(await goldSchemesReady(admin))) return { error: NOT_READY };
  const [view] = await loadSchemes(admin, session.shopId, { id: schemeId });
  if (!view) return { error: "Scheme not found" };
  if (view.scheme.status !== "active") return { error: "This scheme is already closed." };
  const back = Math.max(0, Math.round(Number(refund) * 100) / 100);
  if (back > view.figures.paid + 0.005) return { error: `Only ${view.figures.paid} was paid into this scheme.` };

  const { error } = await admin
    .from("gold_schemes")
    .update({ status: "closed", closed_at: new Date().toISOString(), refund_amount: back })
    .eq("id", schemeId)
    .eq("shop_id", session.shopId)
    .eq("status", "active");
  if (error) return { error: "Could not close — try again." };
  if (back > 0) {
    await recordCashMovement(admin, { shopId: session.shopId, staffId: session.userId, kind: "refund_given", source: "gold_scheme", sourceId: schemeId, method, amount: -back, note: `Scheme ${view.scheme.scheme_number} closed` });
  }
  await logAuditEvent({ admin, shopId: session.shopId, staffId: session.userId, action: "gold_scheme_closed", entityType: "gold_scheme", entityId: schemeId, details: { paid: view.figures.paid, refund: back } });
  refresh(schemeId);
  return {};
}
