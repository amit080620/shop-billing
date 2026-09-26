import { calculateTransactionTotals } from "../validation/schemas";
import { round2 } from "../gst";
import { ACCOMMODATION_SAC } from "./constants";

/** One room on a booking, priced per night before tax. */
export type FolioRoom = {
  id: string;
  label: string;
  roomTypeName: string;
  nights: number;
  ratePerNight: number;
  gstPercent: number;
};

/** An extra posted to the guest's account (laundry, extra bed, ...), priced
 * before tax. */
export type FolioCharge = {
  id: string;
  description: string;
  amount: number;
  gstPercent: number;
};

/** A restaurant order the guest has had charged to their room. Restaurant
 * orders are taxed and invoiced on their own — the total here is what the
 * guest owes for it, tax included. */
export type FolioRoomServiceOrder = {
  id: string;
  orderNumber: string;
  total: number;
};

export type FolioPayment = {
  id: string;
  kind: "advance" | "payment" | "refund";
  amount: number;
  method: string;
};

export type FolioInvoiceItem = {
  description: string;
  hsnCode: string | null;
  quantity: number;
  unitPrice: number;
  gstPercent: number;
};

/** The lines of the GST invoice for the stay: one per room, then one per
 * extra charge. Room service is NOT here — those orders carry their own
 * restaurant invoices. */
export function invoiceItems(rooms: FolioRoom[], charges: FolioCharge[]): FolioInvoiceItem[] {
  const roomLines = rooms.map((r) => ({
    description: `${r.label} · ${r.roomTypeName} (${r.nights} night${r.nights === 1 ? "" : "s"})`,
    hsnCode: ACCOMMODATION_SAC,
    quantity: r.nights,
    unitPrice: r.ratePerNight,
    gstPercent: r.gstPercent,
  }));
  const chargeLines = charges.map((c) => ({
    description: c.description,
    hsnCode: null,
    quantity: 1,
    unitPrice: c.amount,
    gstPercent: c.gstPercent,
  }));
  return [...roomLines, ...chargeLines];
}

export function paymentsNet(payments: FolioPayment[]): number {
  return round2(payments.reduce((sum, p) => sum + (p.kind === "refund" ? -p.amount : p.amount), 0));
}

/** Everything the guest owes and has paid, worked out from the booking's
 * rooms, extras, room-service orders and payments. Used both for the live
 * running total on the booking screen and, at check-out, for the invoice. */
export function computeFolio(input: {
  rooms: FolioRoom[];
  charges: FolioCharge[];
  roomService: FolioRoomServiceOrder[];
  payments: FolioPayment[];
  /** Flat discount off the invoice (rooms + extras), given before tax. */
  discount?: number;
}) {
  const items = invoiceItems(input.rooms, input.charges);
  const totals = calculateTransactionTotals({
    items: items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice, gstPercent: i.gstPercent })),
    discountType: "flat",
    discountValue: Math.max(0, input.discount ?? 0),
    paidAmount: 0,
    supplyType: "intra",
    priceMode: "exclusive",
  });

  const roomSubtotal = round2(input.rooms.reduce((s, r) => s + r.nights * r.ratePerNight, 0));
  const chargesSubtotal = round2(input.charges.reduce((s, c) => s + c.amount, 0));
  const roomServiceTotal = round2(input.roomService.reduce((s, o) => s + o.total, 0));
  const invoiceTotal = totals.total;
  const grandTotal = round2(invoiceTotal + roomServiceTotal);
  const paid = paymentsNet(input.payments);
  const outstanding = round2(grandTotal - paid);

  return {
    items,
    totals,
    roomSubtotal,
    chargesSubtotal,
    invoiceTotal,
    roomServiceTotal,
    grandTotal,
    paid,
    /** What the guest still owes; 0 when settled or overpaid. */
    balance: Math.max(0, outstanding),
    /** What the hotel owes back to the guest when they've paid more than the bill. */
    refundDue: Math.max(0, -outstanding),
  };
}

/** Works out where any unpaid amount at check-out should sit in the books.
 *
 * Restaurant orders charged to the room were closed as fully paid when they
 * were posted, and only the stay invoice and restaurant orders can carry a
 * customer balance — so any shortfall is put on the room invoice first (up to
 * its total), then, only if the guest hasn't even covered that, on the
 * room-service orders, most recent first. Returns amounts to record as unpaid
 * ("credit") on each document; everything else on it counts as paid. */
export function allocateUnpaid(input: {
  invoiceTotal: number;
  roomService: { id: string; total: number }[];
  unpaid: number;
}): { invoiceCredit: number; orderCredits: { id: string; credit: number }[] } {
  let remaining = Math.max(0, round2(input.unpaid));
  const invoiceCredit = round2(Math.min(remaining, input.invoiceTotal));
  remaining = round2(remaining - invoiceCredit);

  const orderCredits: { id: string; credit: number }[] = [];
  for (const order of [...input.roomService].reverse()) {
    if (remaining <= 0) break;
    const credit = round2(Math.min(remaining, order.total));
    if (credit > 0) orderCredits.push({ id: order.id, credit });
    remaining = round2(remaining - credit);
  }
  return { invoiceCredit, orderCredits };
}

/** The rooms of a booking as priced lines on its guest account. */
export function toFolioRooms(
  rooms: { id: string; roomNumber: string | null; roomTypeName: string; ratePerNight: number; gstPercent: number }[],
  nights: number,
): FolioRoom[] {
  return rooms.map((r) => ({
    id: r.id,
    label: r.roomNumber ? `Room ${r.roomNumber}` : "Room (to assign)",
    roomTypeName: r.roomTypeName,
    nights,
    ratePerNight: r.ratePerNight,
    gstPercent: r.gstPercent,
  }));
}
