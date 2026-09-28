"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession, hasPermission } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { financialYearFor, round2 } from "../gst";
import { NO_FIGURES, returnFigures, sumReturned, type LineFigures } from "../returnMath";
import { buyerSchemaReady } from "../gstBuyer";

export type ActionState = { error?: string } | null;

export type ReturnLineInput = { billItemId: string; quantity: number };

export async function createReturnAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  if (!hasPermission(session, "process_returns")) return { error: "You don't have permission to process returns — ask the owner." };
  const admin = createSupabaseAdminClient();

  const billId = formData.get("billId");
  const reason = formData.get("reason");
  const refundMethod = formData.get("refundMethod");
  const linesRaw = formData.get("lines");
  const managerPin = formData.get("managerPin");

  // Manager PIN protection on returns is opt-in and universal — if the
  // shop has set one (in Settings), it applies here regardless of
  // business type, since a fake/inflated return is a real theft vector
  // in any retail-like business, not just restaurants. Shops that never
  // set a PIN see no change at all.
  const { data: shopRow } = await admin.from("shops").select("manager_pin").eq("id", session.shopId).single();
  if (shopRow?.manager_pin) {
    if (typeof managerPin !== "string" || managerPin !== shopRow.manager_pin) {
      return { error: "Manager PIN required to process a return" };
    }
  }

  if (typeof billId !== "string" || !billId) return { error: "Missing bill" };
  if (typeof linesRaw !== "string") return { error: "Invalid submission" };

  let lines: ReturnLineInput[];
  try {
    lines = JSON.parse(linesRaw);
  } catch {
    return { error: "Invalid submission" };
  }
  lines = lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) return { error: "Select at least one item to return" };

  const { data: bill } = await admin
    .from("bills")
    .select("id, customer_id, status")
    .eq("id", billId)
    .eq("shop_id", session.shopId)
    .single();
  if (!bill) return { error: "Bill not found" };
  if (bill.status !== "active") return { error: "This bill was voided — nothing to return against it" };

  const billItemIds = lines.map((l) => l.billItemId);
  const { data: billItems } = await admin
    .from("bill_items")
    .select("id, product_id, product_name, quantity, unit_price, gst_percent, batch_id, line_subtotal, cgst_amount, sgst_amount, igst_amount")
    .in("id", billItemIds)
    .eq("bill_id", billId);
  if (!billItems || billItems.length !== billItemIds.length) {
    return { error: "One or more items could not be verified" };
  }
  const billItemMap = new Map(billItems.map((i) => [i.id, i]));

  // Everything already returned against each line — both to stop returning more than
  // is left, and so the last units get exactly what remains of the line's value.
  const { data: existingReturnItems } = await admin
    .from("return_items")
    .select("bill_item_id, quantity, line_total, cgst_amount, sgst_amount, igst_amount")
    .in("bill_item_id", billItemIds);
  const alreadyReturned = new Map<string, LineFigures>();
  for (const id of billItemIds) {
    alreadyReturned.set(id, sumReturned((existingReturnItems ?? []).filter((ri) => ri.bill_item_id === id)));
  }

  for (const line of lines) {
    const original = billItemMap.get(line.billItemId);
    if (!original) return { error: "Item not found on this bill" };
    const remaining = round2(Number(original.quantity) - (alreadyReturned.get(line.billItemId)?.quantity ?? 0));
    if (line.quantity > remaining) {
      return { error: `Only ${remaining} × "${original.product_name}" left to return on this bill.` };
    }
  }

  // Each line gives back its share of what that line was actually charged — the bill's
  // discount, loyalty redemption and GST-inclusive pricing are already in those figures —
  // so the credit note never refunds or reverses more tax than the sale collected.
  let subtotal = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;
  let total = 0;
  const itemRows = lines.map((line) => {
    const original = billItemMap.get(line.billItemId)!;
    const f = returnFigures(
      { quantity: Number(original.quantity), taxable: Number(original.line_subtotal), cgst: Number(original.cgst_amount), sgst: Number(original.sgst_amount), igst: Number(original.igst_amount) },
      alreadyReturned.get(line.billItemId) ?? NO_FIGURES,
      line.quantity,
    );
    subtotal = round2(subtotal + f.taxable);
    cgstAmount = round2(cgstAmount + f.cgst);
    sgstAmount = round2(sgstAmount + f.sgst);
    igstAmount = round2(igstAmount + f.igst);
    total = round2(total + f.total);
    return {
      bill_item_id: line.billItemId,
      product_id: original.product_id,
      product_name: original.product_name,
      quantity: line.quantity,
      unit_price: original.unit_price,
      gst_percent: original.gst_percent,
      line_subtotal: f.taxable,
      cgst_amount: f.cgst,
      sgst_amount: f.sgst,
      igst_amount: f.igst,
      line_total: f.total,
    };
  });

  const financialYear = financialYearFor(new Date());
  const { data: issuedNumber, error: numberError } = await admin.rpc("next_return_number", {
    p_shop_id: session.shopId,
    p_financial_year: financialYear,
  });
  if (numberError || issuedNumber == null) {
    return { error: "Could not generate a return number. Please try again." };
  }
  const returnNumber = `CN/${financialYear}/${String(issuedNumber).padStart(5, "0")}`;

  const { data: newReturn, error: returnError } = await admin
    .from("returns")
    .insert({
      shop_id: session.shopId,
      bill_id: billId,
      customer_id: bill.customer_id,
      staff_id: session.userId,
      return_number: returnNumber,
      financial_year: financialYear,
      reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
      subtotal,
      cgst_amount: cgstAmount,
      sgst_amount: sgstAmount,
      igst_amount: igstAmount,
      total,
      refund_method: typeof refundMethod === "string" ? (refundMethod as "cash" | "card" | "upi" | "online" | "other" | "credit_adjustment") : "cash",
    })
    .select("id")
    .single();
  if (returnError || !newReturn) {
    console.error("Could not create return", returnError);
    return { error: "Could not create return" };
  }

  const { error: itemsError } = await admin
    .from("return_items")
    .insert(itemRows.map((row) => ({ ...row, return_id: newReturn.id })));
  if (itemsError) {
    await admin.from("returns").delete().eq("id", newReturn.id);
    return { error: "Could not save return items" };
  }

  // "Adjust against credit": the refund comes off what the customer owes. Written as an
  // adjustment entry in payments, which every balance, reminder and ledger already counts, and
  // the daily cash summary leaves out (no money changed hands). Needs migration 0042, which
  // allows that payment method; before it, the credit note only records the choice.
  if (refundMethod === "credit_adjustment" && bill.customer_id && total > 0 && (await buyerSchemaReady(admin))) {
    await admin.from("payments").insert({
      shop_id: session.shopId,
      customer_id: bill.customer_id,
      staff_id: session.userId,
      amount: total,
      payment_method: "adjustment",
      note: `Return ${returnNumber} adjusted against udhaar`,
    });
    revalidatePath("/customers");
    revalidatePath("/reminders");
  }

  // Restore stock for tracked products — best-effort, matches the same
  // philosophy as the sale-side stock decrement. Pharma items go back to
  // the exact batch they were sold from (via the original bill_item's
  // batch_id), so expiry tracking stays accurate — not just the
  // product's aggregate count. Genuinely independent per returned line,
  // so this runs concurrently.
  await Promise.all(
    itemRows.map(async (row) => {
      if (!row.product_id) return;
      const { data: product } = await admin
        .from("products")
        .select("id, track_inventory")
        .eq("id", row.product_id)
        .single();
      if (!product?.track_inventory) return;

      const originalBatchId = billItemMap.get(row.bill_item_id)?.batch_id;
      if (originalBatchId) {
        const { data: batch } = await admin
          .from("medicine_batches")
          .select("id, quantity")
          .eq("id", originalBatchId)
          .single();
        if (batch) {
          await admin
            .from("medicine_batches")
            .update({ quantity: round2(Number(batch.quantity) + row.quantity) })
            .eq("id", batch.id);
        }
      }

      await admin.rpc("increment_stock", { p_product_id: product.id, p_quantity: row.quantity });
    }),
  );

  revalidatePath(`/print/bill/${billId}`);
  if (bill.customer_id) revalidatePath(`/customers/${bill.customer_id}`);
  redirect(`/returns/${newReturn.id}`);
}
