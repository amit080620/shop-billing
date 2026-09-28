"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession, hasPermission } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { financialYearFor, round2, splitTax } from "../gst";
import { buyerSchemaReady } from "../gstBuyer";
import { logAuditEvent } from "../audit";

export type DebitNoteState = { error?: string } | null;

const METHODS = ["cash", "card", "upi", "online", "other", "udhar"] as const;
type Method = (typeof METHODS)[number];

/** Raises the value of an invoice already issued — a price billed too low, or a charge added
 * afterwards — with a numbered debit note (DN/<financial year>/<number>). The invoice itself is
 * never touched: GST wants the correction to be its own document, reported in GSTR-1 Table 9B and
 * added to that month's output tax. The extra is collected now, or put on the customer's udhaar. */
export async function createDebitNoteAction(_prev: DebitNoteState, formData: FormData): Promise<DebitNoteState> {
  const session = await requireSession();
  if (!hasPermission(session, "edit_bills")) return { error: "You don't have permission to change bills — ask the owner." };
  const admin = createSupabaseAdminClient();
  if (!(await buyerSchemaReady(admin))) return { error: "Debit notes need a quick database update first — ask the owner to run migration 0042." };

  const billId = String(formData.get("billId") ?? "");
  const amount = round2(Number(formData.get("amount")));
  const reason = String(formData.get("reason") ?? "").trim();
  const methodRaw = String(formData.get("paymentMethod") ?? "cash");
  const method: Method = (METHODS as readonly string[]).includes(methodRaw) ? (methodRaw as Method) : "cash";
  // A composition dealer can't charge GST on anything, a debit note included.
  const gstPercent = session.gstScheme === "composition" ? 0 : Number(formData.get("gstPercent"));

  if (!billId) return { error: "Missing bill" };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the extra amount (before GST) — more than ₹0." };
  if (!Number.isFinite(gstPercent) || gstPercent < 0 || gstPercent > 40) return { error: "Choose the GST rate for this amount." };
  if (!reason) return { error: "Write why the invoice value is going up — it is printed on the debit note." };

  const { data: bill } = await admin
    .from("bills")
    .select("id, status, supply_type, customer_id")
    .eq("id", billId)
    .eq("shop_id", session.shopId)
    .single();
  if (!bill) return { error: "Bill not found" };
  if (bill.status !== "active") return { error: "This bill was voided — there is nothing to add to." };
  if (method === "udhar" && !bill.customer_id) return { error: "A walk-in bill has no khata to add this to — collect it now instead." };

  const tax = splitTax(amount, gstPercent, bill.supply_type as "intra" | "inter");
  const total = round2(amount + tax.cgst + tax.sgst + tax.igst);

  const financialYear = financialYearFor(new Date());
  const { data: issued, error: numberError } = await admin.rpc("next_debit_note_number", { p_shop_id: session.shopId, p_financial_year: financialYear });
  if (numberError || issued == null) return { error: "Could not generate a debit note number. Please try again." };
  const noteNumber = `DN/${financialYear}/${String(issued).padStart(5, "0")}`;

  const { data: note, error } = await admin
    .from("debit_notes")
    .insert({
      shop_id: session.shopId,
      bill_id: bill.id,
      customer_id: bill.customer_id,
      staff_id: session.userId,
      note_number: noteNumber,
      financial_year: financialYear,
      reason,
      taxable_amount: amount,
      gst_percent: gstPercent,
      cgst_amount: tax.cgst,
      sgst_amount: tax.sgst,
      igst_amount: tax.igst,
      total,
      payment_method: method,
      paid_amount: method === "udhar" ? 0 : total,
      credit_amount: method === "udhar" ? total : 0,
    })
    .select("id")
    .single();
  if (error || !note) return { error: "Could not save the debit note" };

  await logAuditEvent({ admin, shopId: session.shopId, staffId: session.userId, action: "debit_note_issued", entityType: "bill", entityId: bill.id, details: { noteNumber, amount, gstPercent, total, reason } });

  revalidatePath(`/print/bill/${bill.id}`);
  if (bill.customer_id) revalidatePath(`/customers/${bill.customer_id}`);
  redirect(`/print/debit-note/${note.id}`);
}
