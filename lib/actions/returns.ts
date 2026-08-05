"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { splitTax, financialYearFor, round2 } from "../gst";

export type ActionState = { error?: string } | null;

export type ReturnLineInput = { billItemId: string; quantity: number };

export async function createReturnAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const billId = formData.get("billId");
  const reason = formData.get("reason");
  const refundMethod = formData.get("refundMethod");
  const linesRaw = formData.get("lines");

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
    .select("id, customer_id, status, supply_type")
    .eq("id", billId)
    .eq("shop_id", session.shopId)
    .single();
  if (!bill) return { error: "Bill not found" };
  if (bill.status !== "active") return { error: "This bill was voided — nothing to return against it" };

  const billItemIds = lines.map((l) => l.billItemId);
  const { data: billItems } = await admin
    .from("bill_items")
    .select("id, product_id, product_name, quantity, unit_price, gst_percent")
    .in("id", billItemIds)
    .eq("bill_id", billId);
  if (!billItems || billItems.length !== billItemIds.length) {
    return { error: "One or more items could not be verified" };
  }
  const billItemMap = new Map(billItems.map((i) => [i.id, i]));

  // Prevent returning more than what's left un-returned on each line —
  // sum whatever's already been returned against this bill_item before.
  const { data: existingReturnItems } = await admin
    .from("return_items")
    .select("bill_item_id, quantity")
    .in("bill_item_id", billItemIds);
  const alreadyReturned = new Map<string, number>();
  for (const ri of existingReturnItems ?? []) {
    alreadyReturned.set(ri.bill_item_id, (alreadyReturned.get(ri.bill_item_id) ?? 0) + Number(ri.quantity));
  }

  for (const line of lines) {
    const original = billItemMap.get(line.billItemId);
    if (!original) return { error: "Item not found on this bill" };
    const returnedSoFar = alreadyReturned.get(line.billItemId) ?? 0;
    const remaining = round2(Number(original.quantity) - returnedSoFar);
    if (line.quantity > remaining) {
      return { error: `Only ${remaining} × "${original.product_name}" left to return on this bill.` };
    }
  }

  const supplyType = bill.supply_type as "intra" | "inter";

  let subtotal = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;
  const itemRows = lines.map((line) => {
    const original = billItemMap.get(line.billItemId)!;
    const lineSubtotal = round2(line.quantity * Number(original.unit_price));
    const split = splitTax(lineSubtotal, Number(original.gst_percent), supplyType);
    subtotal = round2(subtotal + lineSubtotal);
    cgstAmount = round2(cgstAmount + split.cgst);
    sgstAmount = round2(sgstAmount + split.sgst);
    igstAmount = round2(igstAmount + split.igst);
    return {
      bill_item_id: line.billItemId,
      product_id: original.product_id,
      product_name: original.product_name,
      quantity: line.quantity,
      unit_price: original.unit_price,
      gst_percent: original.gst_percent,
      line_subtotal: lineSubtotal,
      cgst_amount: split.cgst,
      sgst_amount: split.sgst,
      igst_amount: split.igst,
      line_total: round2(lineSubtotal + split.cgst + split.sgst + split.igst),
    };
  });
  const total = round2(subtotal + cgstAmount + sgstAmount + igstAmount);

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

  // Restore stock for tracked products — best-effort, matches the same
  // philosophy as the sale-side stock decrement.
  for (const row of itemRows) {
    if (!row.product_id) continue;
    const { data: product } = await admin
      .from("products")
      .select("id, track_inventory, stock_quantity")
      .eq("id", row.product_id)
      .single();
    if (!product?.track_inventory) continue;
    await admin
      .from("products")
      .update({ stock_quantity: round2(Number(product.stock_quantity) + row.quantity) })
      .eq("id", product.id);
  }

  revalidatePath(`/print/bill/${billId}`);
  if (bill.customer_id) revalidatePath(`/customers/${bill.customer_id}`);
  redirect(`/returns/${newReturn.id}`);
}
