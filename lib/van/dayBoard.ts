// The Van desk's day board (Home and the Van tab): each of today's van trips as one line the owner and
// the salesman read alike — what was sold, the cash to collect, the UPI to check, the udhaar given and
// the stock still on the van — and the day's totals. Pure, so it is tested on its own; lib/van/data.ts
// loads the trips (loadVanDay).
import { moneyDue, type TripStatus } from "./rules";

const money = (n: number) => Math.round(n * 100) / 100;

/** What the board needs of a trip: its summary (lib/van/data tripSummaries) and its stock on the van. */
export type BoardInput = {
  id: string;
  number: string;
  vehicleId: string;
  vehicleName: string;
  salesmanName: string | null;
  route: string | null;
  status: TripStatus;
  openingCash: number;
  loadedAt: string | null;
  returnedAt: string | null;
  settledAt: string | null;
  cashExpected: number | null;
  cashHanded: number | null;
  upiExpected: number | null;
  salesmanCharge: number;
  bills: number;
  sold: number;
  cash: number;
  upi: number;
  credit: number;
  collections: number;
  cashCollections: number;
  upiCollections: number;
  expenses: number;
  cashRefunds: number;
  upiRefunds: number;
  stock: { pieces: number; value: number; items: number };
};

export type BoardTrip = {
  id: string;
  number: string;
  vehicleId: string;
  vehicle: string;
  salesman: string | null;
  route: string | null;
  status: TripStatus;
  /** 1 loaded, 2 on the route, 3 back, 4 settled — the board's little stepper. */
  step: 1 | 2 | 3 | 4;
  bills: number;
  sold: number;
  cash: number;
  upi: number;
  credit: number;
  collections: number;
  expenses: number;
  /** Cash the trip hands over: so far while on the route, final once back, as settled after. */
  cashToHand: number;
  upiToCheck: number;
  stockPieces: number;
  stockValue: number;
  stockItems: number;
  /** Settled: cash handed over less cash expected (negative: short). */
  difference: number | null;
  charge: number;
  loadedAt: string | null;
  returnedAt: string | null;
  settledAt: string | null;
};

export function boardTrip(x: BoardInput): BoardTrip {
  const due = moneyDue({
    openingCash: x.openingCash,
    cashBills: x.cash,
    upiBills: x.upi,
    otherBills: 0,
    creditBills: x.credit,
    cashCollections: x.cashCollections,
    upiCollections: x.upiCollections,
    expenses: x.expenses,
    cashRefunds: x.cashRefunds,
    upiRefunds: x.upiRefunds,
  });
  const settled = x.status === "settled";
  const cashToHand = settled && x.cashExpected !== null ? x.cashExpected : due.cashExpected;
  return {
    id: x.id,
    number: x.number,
    vehicleId: x.vehicleId,
    vehicle: x.vehicleName,
    salesman: x.salesmanName,
    route: x.route,
    status: x.status,
    step: settled ? 4 : x.status === "returned" ? 3 : x.loadedAt ? 2 : 1,
    bills: x.bills,
    sold: money(x.sold),
    cash: money(x.cash),
    upi: money(x.upi),
    credit: money(x.credit),
    collections: money(x.collections),
    expenses: money(x.expenses),
    cashToHand: money(cashToHand),
    upiToCheck: money(settled && x.upiExpected !== null ? x.upiExpected : due.upiExpected),
    stockPieces: settled ? 0 : x.stock.pieces,
    stockValue: settled ? 0 : money(x.stock.value),
    stockItems: settled ? 0 : x.stock.items,
    difference: settled && x.cashExpected !== null && x.cashHanded !== null ? money(x.cashHanded - x.cashExpected) : null,
    charge: money(x.salesmanCharge),
    loadedAt: x.loadedAt,
    returnedAt: x.returnedAt,
    settledAt: x.settledAt,
  };
}

/** Back first (waiting to settle), then on the route, then settled; newest first within each. */
const ORDER: Record<TripStatus, number> = { returned: 0, loaded: 1, draft: 2, settled: 3, cancelled: 4 };
export const boardOrder = (a: BoardTrip, b: BoardTrip) => ORDER[a.status] - ORDER[b.status] || (b.loadedAt ?? "").localeCompare(a.loadedAt ?? "");

export type BoardTotals = {
  sold: number;
  cash: number;
  upi: number;
  credit: number;
  collections: number;
  /** Still to come in: trips not yet settled. */
  cashToCollect: number;
  upiToCheck: number;
  stockValue: number;
  stockPieces: number;
  onRoute: number;
  waiting: number;
  settled: number;
  /** Settled today: cash short (a positive number) across the vans. */
  short: number;
};

export function boardTotals(trips: BoardTrip[]): BoardTotals {
  const open = trips.filter((x) => x.status !== "settled");
  const sum = (rows: BoardTrip[], f: (x: BoardTrip) => number) => money(rows.reduce((s, x) => s + f(x), 0));
  return {
    sold: sum(trips, (x) => x.sold),
    cash: sum(trips, (x) => x.cash),
    upi: sum(trips, (x) => x.upi),
    credit: sum(trips, (x) => x.credit),
    collections: sum(trips, (x) => x.collections),
    cashToCollect: sum(open, (x) => x.cashToHand),
    upiToCheck: sum(open, (x) => x.upiToCheck),
    stockValue: sum(open, (x) => x.stockValue),
    stockPieces: Math.round(open.reduce((s, x) => s + x.stockPieces, 0) * 1000) / 1000,
    onRoute: trips.filter((x) => x.status === "loaded").length,
    waiting: trips.filter((x) => x.status === "returned").length,
    settled: trips.filter((x) => x.status === "settled").length,
    short: sum(trips, (x) => (x.difference !== null && x.difference < 0 ? -x.difference : 0)),
  };
}

type T = (key: string, vars?: Record<string, string | number>) => string;
const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** The day's van summary as one WhatsApp message, so the owner, the godown and the salesmen read the
 * same figures. */
export function boardMessage(trips: BoardTrip[], totals: BoardTotals, dateLabel: string, t: T, statusLabel: (s: TripStatus) => string): string {
  const lines = [`*${t("Vans today")} · ${dateLabel}*`, ""];
  for (const x of trips) {
    lines.push(`🚚 *${x.vehicle}*${x.salesman ? ` (${x.salesman})` : ""} · ${statusLabel(x.status)}`);
    lines.push(`${t("Sold")} ${rupees(x.sold)} · ${t("Cash")} ${rupees(x.cashToHand)} · UPI ${rupees(x.upiToCheck)} · ${t("Udhaar")} ${rupees(x.credit)}`);
    if (x.stockPieces > 0) lines.push(`${t("On van")}: ${x.stockPieces} ${t("pcs")} (${rupees(x.stockValue)})`);
    if (x.difference !== null && x.difference !== 0) lines.push(x.difference < 0 ? `${t("Cash short")} ${rupees(-x.difference)}` : `${t("Cash over")} ${rupees(x.difference)}`);
    lines.push("");
  }
  lines.push(`${t("Cash to collect")}: *${rupees(totals.cashToCollect)}* · UPI ${rupees(totals.upiToCheck)}`);
  if (totals.stockPieces > 0) lines.push(`${t("Stock still on vans")}: ${rupees(totals.stockValue)}`);
  lines.push(`${t("Sold today")}: ${rupees(totals.sold)}`);
  return lines.join("\n");
}
