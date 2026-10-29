"use client";

import { getPendingBills, removePendingBill, updatePendingBill, type PendingBill } from "./offline-db";
import { syncOfflineBillAction } from "./actions/bills";
import { buildReceiptEscPos, type ReceiptData } from "./escpos";
import { calculateTransactionTotals } from "./validation/totals";
import { helperSettings, printViaHelper } from "./printHelper";
import { printViaBluetooth, shouldDefaultToBluetooth } from "./bluetooth-print";

/** Fired after the waiting bills change, so every screen showing them refreshes its list. */
export const OFFLINE_BILLS_EVENT = "ray:offline-bills";

let running: Promise<SyncResult> | null = null;

export type SyncResult = { synced: number; failed: number; stillOffline: boolean };

/** Bills made with no internet belong to the shop they were made in; one queued before bills were
 * tagged belongs to whichever shop syncs it. */
export const belongsTo = (bill: PendingBill, shopId: string) => (bill.shopId ?? shopId) === shopId;

/** Sends this shop's waiting bills to the server, oldest first. Each carries its own id, so a sync
 * cut off half-way and tried again never makes a bill twice (bills.client_ref). A bill the server
 * refuses (say, an item since deleted) is marked failed with the reason, and is retried only when
 * asked (`retryFailed`); a lost connection just stops, to go on next time. One sync at a time. */
export function syncPendingBills(shopId: string, { retryFailed = false } = {}): Promise<SyncResult> {
  if (running) return running;
  running = (async () => {
    const result: SyncResult = { synced: 0, failed: 0, stillOffline: false };
    try {
      for (const bill of await getPendingBills()) {
        if (!belongsTo(bill, shopId)) continue;
        if (bill.status === "failed" && !retryFailed) continue;
        let reply: Awaited<ReturnType<typeof syncOfflineBillAction>>;
        try {
          reply = await syncOfflineBillAction({
            clientRef: bill.localId,
            createdAt: bill.createdAt,
            bill: {
              customerId: bill.customerId,
              items: bill.items.map((i) => ({
                productId: i.productId,
                description: i.name,
                hsnCode: i.hsnCode ?? undefined,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                gstPercent: i.gstPercent,
              })),
              discountType: bill.discountType,
              discountValue: bill.discountValue,
              paidAmount: bill.paidAmount,
              paymentMethod: bill.paymentMethod,
            },
          });
        } catch {
          // No answer: the bill may or may not have been made. It keeps its id, so the next try finds it.
          result.stillOffline = true;
          break;
        }
        if ("error" in reply) {
          result.failed++;
          await updatePendingBill({ ...bill, status: "failed", syncError: reply.error });
        } else {
          result.synced++;
          await removePendingBill(bill.localId);
        }
      }
    } finally {
      running = null;
      window.dispatchEvent(new Event(OFFLINE_BILLS_EVENT));
    }
    return result;
  })();
  return running;
}

/** The slip a customer takes away from an offline sale: the items and the total, plainly marked as
 * not yet a GST invoice — its invoice number comes when it syncs. */
export function offlineSlipData(bill: PendingBill, shopName: string, priceIncludesGst: boolean | undefined): ReceiptData {
  const totals = calculateTransactionTotals({
    items: bill.items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice, gstPercent: i.gstPercent })),
    discountType: bill.discountType,
    discountValue: bill.discountValue,
    paidAmount: bill.paidAmount,
    supplyType: "intra",
    priceMode: priceIncludesGst === false ? "exclusive" : "inclusive",
  });
  const at = new Date(bill.createdAt);
  return {
    shopName,
    invoiceNumber: `PROVISIONAL ${bill.localId.slice(-6).toUpperCase()}`,
    dateText: at.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }),
    timeText: at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }),
    customerName: bill.customerName,
    paymentLabel: bill.paymentMethod.toUpperCase(),
    items: bill.items.map((i) => ({ name: i.name, qty: i.quantity, price: i.unitPrice, lineTotal: Math.round(i.quantity * i.unitPrice * 100) / 100 })),
    subtotal: totals.subtotal,
    discount: totals.discountAmount || undefined,
    total: totals.total,
    paidAmount: totals.paidAmount,
    creditAmount: totals.balanceAmount || undefined,
    footerText: "Provisional slip - GST invoice number follows once synced",
  };
}

/** Prints the slip through the Print Helper (computer) or a Bluetooth printer (phone) — both work
 * with no internet. */
export async function printOfflineSlip(data: ReceiptData): Promise<{ error?: string }> {
  const helper = helperSettings();
  if (helper.enabled) {
    const r = await printViaHelper(buildReceiptEscPos(data, 48), helper.printer);
    if (!r.error) return {};
    if (r.reachable) return { error: r.error };
  }
  if (shouldDefaultToBluetooth()) {
    const r = await printViaBluetooth(buildReceiptEscPos(data, 32));
    return r.error ? { error: r.error } : {};
  }
  return { error: "To print with no internet, use a Bluetooth printer (phone) or the Print Helper (computer)." };
}
