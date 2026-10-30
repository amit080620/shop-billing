"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession, hasPermission, type SessionContext } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { financialYearFor, round2 } from "../gst";
import { NO_FIGURES, returnFigures, sumReturned, type LineFigures } from "../returnMath";
import { buyerSchemaReady } from "../gstBuyer";
import { giveBackReturn, recordReturn } from "../stockMoves";
import { missingColumn } from "../stockRule";
import { logAuditEvent } from "../audit";

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
  // The form's own id for this request: sent again (Save pressed after a lost answer), it is saved once.
  // Every request needs one; a form that sent none (its script hadn't loaded) gets a fresh one here —
  // that request is then saved once, but pressing Save again counts as a new return.
  const clientRefRaw = formData.get("clientRef");
  const formRef = typeof clientRefRaw === "string" && /^[A-Za-z0-9-]{8,64}$/.test(clientRefRaw) ? clientRefRaw : null;
  const clientRef = formRef ?? crypto.randomUUID();

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
  // Numbers, above zero: a quantity sent as text ("2") would otherwise be added on as text.
  lines = (Array.isArray(lines) ? lines : []).map((l) => ({ ...l, quantity: Number(l.quantity) })).filter((l) => Number.isFinite(l.quantity) && l.quantity > 0);
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
  const method = typeof refundMethod === "string" ? (refundMethod as "cash" | "card" | "upi" | "online" | "other" | "credit_adjustment") : "cash";
  // "Adjust against credit": the refund comes off what the customer owes. Written as an adjustment
  // entry in payments, which every balance, reminder and ledger already counts, and the daily cash
  // summary leaves out (no money changed hands). Needs migration 0042, which allows that payment
  // method; before it, the credit note only records the choice.
  const creditNote = method === "credit_adjustment" && bill.customer_id && total > 0 && (await buyerSchemaReady(admin)) ? `Return ${returnNumber} adjusted against udhaar` : null;
  const header = {
    return_number: returnNumber,
    financial_year: financialYear,
    reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
    subtotal,
    cgst_amount: cgstAmount,
    sgst_amount: sgstAmount,
    igst_amount: igstAmount,
    total,
    refund_method: method,
  };
  const done = (returnId: string) => {
    if (creditNote) {
      revalidatePath("/customers");
      revalidatePath("/reminders");
    }
    revalidatePath(`/print/bill/${billId}`);
    if (bill.customer_id) revalidatePath(`/customers/${bill.customer_id}`);
    redirect(`/returns/${returnId}`);
  };

  // The whole return in one database transaction holding the bill (lib/stockMoves recordReturn):
  // never more returned than sold, even by two staff at once; nothing against a bill voided
  // meanwhile; the goods, their batch and the udhaar adjustment with it or not at all; and this form's
  // request (clientRef) saved once, so pressing Save again after a lost answer is safe.
  const recorded = await recordReturn(admin, {
    shopId: session.shopId,
    billId,
    staffId: session.userId,
    clientRef,
    header,
    lines: itemRows.map((row) => ({
      bill_item_id: row.bill_item_id,
      quantity: row.quantity,
      unit_price: row.unit_price,
      gst_percent: row.gst_percent,
      line_subtotal: row.line_subtotal,
      cgst_amount: row.cgst_amount,
      sgst_amount: row.sgst_amount,
      igst_amount: row.igst_amount,
      line_total: row.line_total,
    })),
    creditNote,
  });
  if (recorded.kind === "saved") return done(recorded.returnId);
  if (recorded.kind === "voided") return { error: "This bill was voided just now — its goods are already back in stock, so nothing was returned." };
  if (recorded.kind === "too_many") {
    const name = billItemMap.get(recorded.billItemId)?.product_name ?? "this item";
    return { error: `Only ${recorded.left} × "${name}" left to return on this bill — another return was just made.` };
  }
  if (recorded.kind === "refused") return { error: recorded.error };
  if (recorded.kind === "failed") {
    await logAuditEvent({
      admin,
      shopId: session.shopId,
      staffId: session.userId,
      action: "return_not_confirmed",
      entityType: "bill",
      entityId: billId,
      details: { returnNumber, clientRef, lines: lines.map((l) => ({ billItemId: l.billItemId, quantity: l.quantity })) },
    });
    return {
      error: formRef
        ? "The return couldn't be confirmed (the connection dropped). Press Save again — it won't be saved twice."
        : "The return couldn't be confirmed (the connection dropped). Check this bill's returns before trying again.",
    };
  }

  // Before migration 0060: saved step by step.
  const legacy = await saveReturnStepByStep(admin, session, { billId, customerId: bill.customer_id, header, itemRows, billItemMap, creditNote });
  if ("error" in legacy) return { error: legacy.error };
  return done(legacy.returnId);
}

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type ItemRow = { bill_item_id: string; product_id: string | null; product_name: string; quantity: number; unit_price: number; gst_percent: number; line_subtotal: number; cgst_amount: number; sgst_amount: number; igst_amount: number; line_total: number };

/** A return saved but not wanted any more (its lines failed, or its bill was voided meanwhile): taken
 * away. If it can't be, it is written down so it doesn't stay unnoticed, and the counter is told. */
async function removeReturn(admin: Admin, session: SessionContext, returnId: string, returnNumber: string, why: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await admin.from("returns").delete().eq("id", returnId).eq("shop_id", session.shopId);
    if (!error) return "";
    console.error("Could not remove a return", returnId, error);
  }
  await logAuditEvent({ admin, shopId: session.shopId, staffId: session.userId, action: "return_cleanup_failed", entityType: "return", entityId: returnId, details: { returnNumber, reason: why } });
  return ` Credit note ${returnNumber} could not be removed — it is in the activity log; delete it before making another return.`;
}

/** The old way, for a database without record_return (before migration 0060): the credit note, its
 * lines, the goods back, the batch and the adjustment, one after another. Each step is checked: a
 * step that fails takes back what came before it or is written down — nothing is left half-done
 * without a trace. */
async function saveReturnStepByStep(
  admin: Admin,
  session: SessionContext,
  r: { billId: string; customerId: string | null; header: Record<string, string | number | null>; itemRows: ItemRow[]; billItemMap: Map<string, { batch_id: string | null }>; creditNote: string | null },
): Promise<{ returnId: string } | { error: string }> {
  const returnNumber = String(r.header.return_number);
  const { data: newReturn, error: returnError } = await admin
    .from("returns")
    .insert({
      shop_id: session.shopId,
      bill_id: r.billId,
      customer_id: r.customerId,
      staff_id: session.userId,
      return_number: returnNumber,
      financial_year: String(r.header.financial_year),
      reason: (r.header.reason as string | null) ?? null,
      subtotal: Number(r.header.subtotal),
      cgst_amount: Number(r.header.cgst_amount),
      sgst_amount: Number(r.header.sgst_amount),
      igst_amount: Number(r.header.igst_amount),
      total: Number(r.header.total),
      refund_method: r.header.refund_method as "cash" | "card" | "upi" | "online" | "other" | "credit_adjustment",
    })
    .select("id")
    .single();
  if (returnError || !newReturn) {
    console.error("Could not create return", returnError);
    return { error: "Could not create return" };
  }

  // Each line remembers how much of it went back on the shelf (stock_back) where the column exists:
  // 0 until it has, so a void of this bill gives back only the rest.
  const saveItems = (withStockBack: boolean) =>
    admin
      .from("return_items")
      .insert(r.itemRows.map((row) => ({ ...row, return_id: newReturn.id, ...(withStockBack ? { stock_back: 0 } : {}) })))
      .select("id, bill_item_id, product_id, quantity");
  let saved = await saveItems(true);
  const stockBackReady = !(saved.error && missingColumn(saved.error));
  if (!stockBackReady) saved = await saveItems(false);
  if (saved.error || !saved.data) {
    return { error: `Could not save return items.${await removeReturn(admin, session, newReturn.id, returnNumber, "its lines could not be saved")}` };
  }

  // The goods back on the shelf, once, holding the bill (giveBackReturn) — as the sale's record says
  // where the bill has one, else for the items counted today. Voided meanwhile: the void gave
  // everything back, so this return is taken away.
  const returnedIds = [...new Set(r.itemRows.map((row) => row.product_id).filter((id): id is string => !!id))];
  const { data: returnedProducts } = returnedIds.length
    ? await admin.from("products").select("id, track_inventory").eq("shop_id", session.shopId).in("id", returnedIds)
    : { data: [] };
  const tracked = new Set((returnedProducts ?? []).filter((p) => p.track_inventory).map((p) => p.id));
  const back = await giveBackReturn(admin, {
    shopId: session.shopId,
    staffId: session.userId,
    returnId: newReturn.id,
    lines: saved.data.filter((i) => i.product_id).map((i) => ({ returnItemId: i.id, productId: i.product_id as string, quantity: Number(i.quantity) })),
    stockBackReady,
    countedNow: tracked,
  });
  if (back === "voided") {
    return { error: `This bill was voided just now — its goods are already back in stock, so nothing was returned.${await removeReturn(admin, session, newReturn.id, returnNumber, "its bill was voided meanwhile")}` };
  }
  if (back === "failed") {
    // Saved, but its goods aren't back yet: written down, and the credit note offers "Put back in stock" (safe to repeat).
    await logAuditEvent({ admin, shopId: session.shopId, staffId: session.userId, action: "return_stock_not_restored", entityType: "return", entityId: newReturn.id, details: { returnNumber } });
  }

  // The udhaar adjustment only while the bill is still active.
  if (r.creditNote) {
    const { data: still } = await admin.from("bills").select("status").eq("id", r.billId).eq("shop_id", session.shopId).maybeSingle();
    if (still?.status === "active") {
      await admin.from("payments").insert({
        shop_id: session.shopId,
        customer_id: r.customerId as string,
        staff_id: session.userId,
        amount: Number(r.header.total),
        payment_method: "adjustment",
        note: r.creditNote,
      });
    } else {
      await logAuditEvent({ admin, shopId: session.shopId, staffId: session.userId, action: "return_adjustment_skipped", entityType: "return", entityId: newReturn.id, details: { returnNumber, reason: "bill voided" } });
    }
  }

  // Pharma items also go back to the exact batch they were sold from, once their stock went back.
  if (back === "ok") {
    await Promise.all(
      r.itemRows
        .filter((row) => row.product_id && tracked.has(row.product_id))
        .map(async (row) => {
          const originalBatchId = r.billItemMap.get(row.bill_item_id)?.batch_id;
          if (!originalBatchId) return;
          const { data: batch } = await admin.from("medicine_batches").select("id, quantity").eq("id", originalBatchId).single();
          if (batch) await admin.from("medicine_batches").update({ quantity: round2(Number(batch.quantity) + row.quantity) }).eq("id", batch.id);
        }),
    );
  }
  return { returnId: newReturn.id };
}

/** A credit note whose goods didn't go back on the shelf (its database call failed): try again.
 * Safe to repeat — give_back_return moves only lines not yet given back, holding the bill. */
export async function retryReturnStockAction(returnId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!hasPermission(session, "process_returns")) return { error: "You don't have permission to process returns — ask the owner." };
  const admin = createSupabaseAdminClient();
  const { data: ret } = await admin.from("returns").select("id, return_number").eq("id", returnId).eq("shop_id", session.shopId).maybeSingle();
  if (!ret) return { error: "Credit note not found" };
  const { data: rows, error } = await admin.from("return_items").select("id, product_id, quantity, stock_back").eq("return_id", returnId);
  if (error) return { error: "This needs a one-time database update (migration 0060)." };
  const pending = (rows ?? []).filter((row) => row.product_id && row.stock_back === 0 && Number(row.quantity) > 0);
  if (!pending.length) return {};
  // Every waiting line: the database puts back what the sale's record says (whatever the item's
  // setting is today); only the old way, without the function, goes by the items counted today.
  const { data: products } = await admin.from("products").select("id, track_inventory").eq("shop_id", session.shopId).in("id", pending.map((row) => row.product_id as string));
  const tracked = new Set((products ?? []).filter((p) => p.track_inventory).map((p) => p.id));
  const back = await giveBackReturn(admin, {
    shopId: session.shopId,
    staffId: session.userId,
    returnId,
    lines: pending.map((row) => ({ returnItemId: row.id, productId: row.product_id as string, quantity: Number(row.quantity) })),
    stockBackReady: true,
    countedNow: tracked,
  });
  if (back === "voided") return { error: "The bill was voided — its goods went back with the void." };
  if (back === "failed") return { error: "Could not put the goods back just now — try again in a moment." };
  await logAuditEvent({ admin, shopId: session.shopId, staffId: session.userId, action: "return_stock_restored", entityType: "return", entityId: returnId, details: { returnNumber: ret.return_number } });
  revalidatePath(`/returns/${returnId}`);
  return {};
}
