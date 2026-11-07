// The Van desk's day board (Home and the Van tab), and the Van tab itself: the figures each van line
// shows, the evening's totals, the order (vans back first), the WhatsApp summary; and the tab a
// wholesale shop that runs vans gets — open to its salesmen, while the owner's van screens stay closed.
import { describe, expect, it } from "vitest";
import { boardMessage, boardOrder, boardTotals, boardTrip, type BoardInput } from "../dayBoard";
import { tabsFor } from "@/app/(dashboard)/BottomNav";
import { mobileTabs } from "../../mobileTabs";
import { ACCESS_V2, canOpen } from "../../staffAccess";

const base: BoardInput = {
  id: "t1",
  number: "V1-20261107-01",
  vehicleId: "v1",
  vehicleName: "Van 1",
  salesmanName: "Ramu",
  route: "Station Road",
  status: "loaded",
  openingCash: 500,
  loadedAt: "2026-11-07T03:00:00Z",
  returnedAt: null,
  settledAt: null,
  cashExpected: null,
  cashHanded: null,
  upiExpected: null,
  salesmanCharge: 0,
  bills: 6,
  sold: 9000,
  cash: 4200,
  upi: 1800,
  credit: 3000,
  collections: 1200,
  cashCollections: 1000,
  upiCollections: 200,
  expenses: 450,
  cashRefunds: 250,
  upiRefunds: 100,
  stock: { pieces: 34, value: 5400, items: 3 },
};

describe("a van's line on the board", () => {
  it("on the route: the cash so far to hand over, the UPI to check and the stock still on the van", () => {
    const x = boardTrip(base);
    expect(x.step).toBe(2);
    expect(x.cashToHand).toBe(500 + 4200 + 1000 - 450 - 250);
    expect(x.upiToCheck).toBe(1800 + 200 - 100);
    expect([x.stockPieces, x.stockValue, x.stockItems]).toEqual([34, 5400, 3]);
    expect(x.difference).toBeNull();
  });

  it("back: waiting to settle; settled: the figures as settled, the cash difference, nothing left on the van", () => {
    expect(boardTrip({ ...base, status: "returned" }).step).toBe(3);
    const s = boardTrip({ ...base, status: "settled", cashExpected: 5000, cashHanded: 4900, upiExpected: 1900, salesmanCharge: 100 });
    expect(s.step).toBe(4);
    expect(s.cashToHand).toBe(5000);
    expect(s.upiToCheck).toBe(1900);
    expect(s.difference).toBe(-100);
    expect([s.stockPieces, s.stockValue]).toEqual([0, 0]);
    expect(s.charge).toBe(100);
  });
});

describe("the day's board", () => {
  const onRoute = boardTrip(base);
  const back = boardTrip({ ...base, id: "t2", vehicleId: "v2", vehicleName: "Van 2", status: "returned", loadedAt: "2026-11-07T02:00:00Z" });
  const settled = boardTrip({ ...base, id: "t3", vehicleId: "v3", vehicleName: "Van 3", status: "settled", cashExpected: 3000, cashHanded: 2800, upiExpected: 900 });

  it("puts the vans that are back first, then those on the route, then the settled ones", () => {
    expect([settled, onRoute, back].sort(boardOrder).map((x) => x.id)).toEqual(["t2", "t1", "t3"]);
  });

  it("totals: cash and UPI still to come in from vans not settled, stock still out, and today's shortage", () => {
    const t = boardTotals([onRoute, back, settled]);
    expect(t.cashToCollect).toBe(onRoute.cashToHand + back.cashToHand);
    expect(t.upiToCheck).toBe(onRoute.upiToCheck + back.upiToCheck);
    expect(t.stockValue).toBe(10800);
    expect(t.stockPieces).toBe(68);
    expect([t.onRoute, t.waiting, t.settled]).toEqual([1, 1, 1]);
    expect(t.short).toBe(200);
    expect(t.sold).toBe(27000);
  });

  it("is one WhatsApp message with every van and the totals", () => {
    const trips = [back, onRoute, settled];
    const text = boardMessage(trips, boardTotals(trips), "7 Nov", (k) => k, (s) => s);
    expect(text).toMatch(/^\*Vans today · 7 Nov\*/);
    expect(text).toMatch(/\*Van 2\* \(Ramu\) · returned/);
    expect(text).toMatch(/Cash short ₹200/);
    expect(text).toMatch(/Cash to collect: \*₹/);
  });
});

describe("the Van tab", () => {
  const t = (k: string) => k;
  const extra = { home: { href: "/dashboard" }, customers: { href: "/customers" } };

  it("a wholesale shop that runs vans gets Van after Sell and Customers; Reports moves to More", () => {
    const tabs = tabsFor("wholesale", t, [], false, true);
    expect(mobileTabs<{ href: string }>(tabs, extra).map((x) => x.href)).toEqual(["/dashboard", "/bills/new", "/customers", "/van", "/purchases"]);
  });

  it("other shops, and wholesale shops without vans, keep their bar as it was", () => {
    expect(mobileTabs<{ href: string }>(tabsFor("wholesale", t, [], false, false), extra).map((x) => x.href)).toEqual(["/dashboard", "/bills/new", "/customers", "/purchases", "/reports"]);
    expect(tabsFor("grocery", t, [], false, true).some((x) => x.href === "/van")).toBe(false);
  });

  it("a salesman with billing only opens the Van desk and his trips, not the owner's van screens", () => {
    const can = (href: string) => canOpen({ role: "staff", businessType: "wholesale", permissions: [ACCESS_V2] }, href);
    expect(can("/van")).toBe(true);
    expect(can("/van/trips/abc")).toBe(true);
    expect(can("/van/vans")).toBe(false);
    expect(can("/van/reports")).toBe(false);
    expect(tabsFor("wholesale", t, [ACCESS_V2], false, true).some((x) => x.href === "/van")).toBe(true);
  });
});
