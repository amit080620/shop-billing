// Wholesale van sales: the sums a trip's settlement rests on. Pure, so they are tested on their own;
// lib/van/data.ts loads the rows and the database (migration 0066) moves the stock.

export type TripStatus = "draft" | "loaded" | "returned" | "settled" | "cancelled";

export const STATUS_LABEL: Record<TripStatus, string> = {
  draft: "Not loaded yet",
  loaded: "On the route",
  returned: "Back, to settle",
  settled: "Settled",
  cancelled: "Cancelled",
};

export const EXPENSE_KINDS = ["diesel", "toll", "labour", "food", "repair", "other"] as const;
export type ExpenseKind = (typeof EXPENSE_KINDS)[number];
export const EXPENSE_LABEL: Record<ExpenseKind, string> = { diesel: "Diesel", toll: "Toll", labour: "Loading / labour", food: "Food", repair: "Repair", other: "Other" };

const qty = (n: number) => Math.round(n * 1000) / 1000;
const money = (n: number) => Math.round(n * 100) / 100;

/** One item at settlement: what should be on the van, what came back good and what came back broken. */
export type CountLine = { productId: string; name: string; expected: number; counted: number; damaged: number; price: number };
export type CountResult = CountLine & { shortage: number; excess: number; shortageValue: number };

/** What is missing (written off) or extra (taken in) for each item, and what the missing pieces are
 * worth at the selling price — the database does the same sums when it settles. */
export function countResult(lines: CountLine[]): { lines: CountResult[]; shortageValue: number; damaged: number; excess: number } {
  const out = lines.map((l) => {
    const shortage = qty(Math.max(l.expected - l.counted - l.damaged, 0));
    const excess = qty(Math.max(l.counted + l.damaged - l.expected, 0));
    return { ...l, shortage, excess, shortageValue: money(shortage * l.price) };
  });
  return {
    lines: out,
    shortageValue: money(out.reduce((s, l) => s + l.shortageValue, 0)),
    damaged: qty(out.reduce((s, l) => s + l.damaged, 0)),
    excess: qty(out.reduce((s, l) => s + l.excess, 0)),
  };
}

/** The money a trip should hand over. Cash: what it set out with, the cash taken on its bills and
 * collections, less its expenses (paid from that cash). UPI and the rest went straight to the shop's
 * account, so they are checked, not handed over. */
export type TripMoney = { openingCash: number; cashBills: number; upiBills: number; otherBills: number; creditBills: number; cashCollections: number; upiCollections: number; expenses: number };

export function moneyDue(m: TripMoney): { cashExpected: number; upiExpected: number; sold: number } {
  return {
    cashExpected: money(m.openingCash + m.cashBills + m.cashCollections - m.expenses),
    upiExpected: money(m.upiBills + m.upiCollections),
    sold: money(m.cashBills + m.upiBills + m.otherBills + m.creditBills),
  };
}

/** Cash short at settlement (a negative difference is cash over). */
export const cashDifference = (expected: number, handed: number) => money(handed - expected);

/** Who may load a van, settle a trip and see every trip: the owner or a manager. */
export const canRunVans = (role: string) => role === "owner" || role === "manager";

/** A trip's salesman may bill from it, add expenses and bring it back; so may the owner or a manager. */
export const mayWorkTrip = (role: string, userId: string, salesmanId: string | null) => canRunVans(role) || (!!salesmanId && salesmanId === userId);

/** Error codes from the database's van functions, in plain words. */
export function vanError(message: string | undefined, detail?: string | null): string {
  const d = (() => {
    try {
      return detail ? (JSON.parse(detail) as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  })();
  switch (message) {
    case "vehicle_busy":
      return `${d.name ?? "This van"} already has a trip open. Settle it first.`;
    case "insufficient_godown_stock":
      return `Only ${d.available ?? 0} of ${d.name ?? "an item"} in ${d.godown ?? "the godown"} (asked ${d.requested ?? "?"}).`;
    case "insufficient_vehicle_stock":
      return `Only ${d.available ?? 0} of ${d.name ?? "an item"} left in the van (asked ${d.requested ?? "?"}).`;
    case "trip_closed":
    case "trip_not_on_route":
    case "trip_not_open":
      return "This trip isn't open for that any more.";
    case "trip_settled":
      return "This van trip is settled, so its bills can't be changed.";
    case "trip_loaded":
      return "This trip is already loaded. Bring the van back and settle it instead.";
    case "count_missing":
      return "Count every item on the van before settling.";
    case "invalid_count":
    case "invalid_quantity":
      return "Enter quantities of 0 or more.";
    case "no_lines":
      return "Add at least one item.";
    case "not_tracked":
      return `Switch on "Track stock" for ${d.name ?? "the item"} before loading it.`;
    case "inactive_godown":
      return `${d.name ?? "That van or godown"} is switched off.`;
    case "unknown_vehicle":
    case "unknown_trip":
      return "That van or trip wasn't found.";
    default:
      return "Couldn't do that. Please try again.";
  }
}
