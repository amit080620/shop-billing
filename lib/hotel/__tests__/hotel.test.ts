import { describe, expect, it } from "vitest";
import { accommodationGstPercent, roomGstPercent } from "../gst";
import { addDays, isIsoDate, nightDates, nightsBetween, stayOverlaps } from "../dates";
import { availabilityByType, freeRooms } from "../availability";
import { allocateUnpaid, computeFolio, invoiceItems, paymentsNet } from "../folio";
import { sourceIsOta, sourceTakesCommission } from "../constants";
import { parseRoomNumbers } from "../roomNumbers";
import { summarizeStays } from "../reports";

describe("accommodation GST slabs", () => {
  it("is exempt up to 1000, 5% up to 7500, 18% above", () => {
    expect(accommodationGstPercent(800)).toBe(0);
    expect(accommodationGstPercent(1000)).toBe(0);
    expect(accommodationGstPercent(1001)).toBe(5);
    expect(accommodationGstPercent(7500)).toBe(5);
    expect(accommodationGstPercent(7501)).toBe(18);
  });

  it("lets a room type override the slab, including with 0", () => {
    expect(roomGstPercent(3000, null)).toBe(5);
    expect(roomGstPercent(3000, 12)).toBe(12);
    expect(roomGstPercent(9000, 0)).toBe(0);
  });
});

describe("stay dates", () => {
  it("counts nights as check-out minus check-in", () => {
    expect(nightsBetween("2026-10-12", "2026-10-14")).toBe(2);
    expect(nightsBetween("2026-10-31", "2026-11-02")).toBe(2);
    expect(nightsBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("lists each occupied night and excludes the check-out day", () => {
    expect(nightDates("2026-10-12", "2026-10-15")).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
    expect(nightDates("2026-10-12", "2026-10-12")).toEqual([]);
  });

  it("treats back-to-back stays as not overlapping", () => {
    expect(stayOverlaps("2026-10-12", "2026-10-14", "2026-10-14", "2026-10-16")).toBe(false);
    expect(stayOverlaps("2026-10-12", "2026-10-15", "2026-10-14", "2026-10-16")).toBe(true);
    expect(stayOverlaps("2026-10-10", "2026-10-20", "2026-10-12", "2026-10-13")).toBe(true);
  });

  it("validates real calendar dates only", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("12/10/2026")).toBe(false);
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("availability", () => {
  const rooms = [
    { id: "r1", roomTypeId: "dlx", isBlocked: false },
    { id: "r2", roomTypeId: "dlx", isBlocked: false },
    { id: "r3", roomTypeId: "dlx", isBlocked: true },
    { id: "r4", roomTypeId: "std", isBlocked: false },
  ];

  it("counts stock per type without blocked rooms", () => {
    const a = availabilityByType({ rooms, booked: [], checkIn: "2026-10-12", checkOut: "2026-10-14" });
    expect(a.dlx).toEqual({ total: 2, booked: 0, available: 2 });
    expect(a.std.available).toBe(1);
  });

  it("subtracts overlapping bookings, assigned or not", () => {
    const booked = [
      { bookingId: "b1", roomTypeId: "dlx", roomId: "r1", checkIn: "2026-10-13", checkOut: "2026-10-15" },
      { bookingId: "b2", roomTypeId: "dlx", roomId: null, checkIn: "2026-10-12", checkOut: "2026-10-13" },
    ];
    const a = availabilityByType({ rooms, booked, checkIn: "2026-10-12", checkOut: "2026-10-14" });
    expect(a.dlx.booked).toBe(2);
    expect(a.dlx.available).toBe(0);
    // A later window only clashes with b1
    const later = availabilityByType({ rooms, booked, checkIn: "2026-10-14", checkOut: "2026-10-16" });
    expect(later.dlx.available).toBe(1);
  });

  it("ignores the booking being edited", () => {
    const booked = [{ bookingId: "b1", roomTypeId: "std", roomId: "r4", checkIn: "2026-10-12", checkOut: "2026-10-14" }];
    const a = availabilityByType({ rooms, booked, checkIn: "2026-10-12", checkOut: "2026-10-14", excludeBookingId: "b1" });
    expect(a.std.available).toBe(1);
  });

  it("never reports negative availability when overbooked", () => {
    const booked = [
      { bookingId: "b1", roomTypeId: "std", roomId: null, checkIn: "2026-10-12", checkOut: "2026-10-14" },
      { bookingId: "b2", roomTypeId: "std", roomId: null, checkIn: "2026-10-12", checkOut: "2026-10-14" },
    ];
    expect(availabilityByType({ rooms, booked, checkIn: "2026-10-12", checkOut: "2026-10-14" }).std.available).toBe(0);
  });

  it("offers only in-service rooms not assigned to an overlapping stay", () => {
    const booked = [{ bookingId: "b1", roomTypeId: "dlx", roomId: "r1", checkIn: "2026-10-12", checkOut: "2026-10-14" }];
    const free = freeRooms({ rooms, booked, checkIn: "2026-10-13", checkOut: "2026-10-15", roomTypeId: "dlx" });
    expect(free.map((r) => r.id)).toEqual(["r2"]);
  });
});

describe("folio", () => {
  const rooms = [{ id: "br1", label: "Room 101", roomTypeName: "Deluxe", nights: 2, ratePerNight: 3000, gstPercent: 5 }];

  it("adds room tax on top of the tariff and rounds the invoice", () => {
    const f = computeFolio({ rooms, charges: [], roomService: [], payments: [] });
    // 2 × 3000 = 6000 + 5% = 6300
    expect(f.roomSubtotal).toBe(6000);
    expect(f.totals.cgstAmount).toBe(150);
    expect(f.totals.sgstAmount).toBe(150);
    expect(f.invoiceTotal).toBe(6300);
    expect(f.grandTotal).toBe(6300);
    expect(f.balance).toBe(6300);
  });

  it("puts extras on the invoice with their own GST and room service outside it", () => {
    const f = computeFolio({
      rooms,
      charges: [{ id: "c1", description: "Laundry", amount: 500, gstPercent: 18 }],
      roomService: [{ id: "o1", orderNumber: "R-1", total: 840 }],
      payments: [],
    });
    // invoice: 6000 + 500 = 6500 taxable; tax = 300 + 90 = 390 → 6890
    expect(f.invoiceTotal).toBe(6890);
    expect(f.roomServiceTotal).toBe(840);
    expect(f.grandTotal).toBe(7730);
  });

  it("nets advances, payments and refunds against the total", () => {
    const payments = [
      { id: "p1", kind: "advance" as const, amount: 2000, method: "upi" },
      { id: "p2", kind: "payment" as const, amount: 1000, method: "cash" },
      { id: "p3", kind: "refund" as const, amount: 500, method: "cash" },
    ];
    expect(paymentsNet(payments)).toBe(2500);
    const f = computeFolio({ rooms, charges: [], roomService: [], payments });
    expect(f.paid).toBe(2500);
    expect(f.balance).toBe(3800);
    expect(f.refundDue).toBe(0);
  });

  it("reports a refund due when the guest has overpaid", () => {
    const f = computeFolio({
      rooms,
      charges: [],
      roomService: [],
      payments: [{ id: "p", kind: "advance", amount: 7000, method: "upi" }],
    });
    expect(f.balance).toBe(0);
    expect(f.refundDue).toBe(700);
  });

  it("applies a flat discount before tax", () => {
    const f = computeFolio({ rooms, charges: [], roomService: [], payments: [], discount: 600 });
    // 6000 − 600 = 5400, tax 5% = 270 → 5670
    expect(f.totals.discountAmount).toBe(600);
    expect(f.invoiceTotal).toBe(5670);
  });

  it("labels invoice lines with the room and SAC code", () => {
    const items = invoiceItems(rooms, [{ id: "c", description: "Extra bed", amount: 800, gstPercent: 5 }]);
    expect(items[0].description).toBe("Room 101 · Deluxe (2 nights)");
    expect(items[0].hsnCode).toBe("996311");
    expect(items[0].quantity).toBe(2);
    expect(items[1].hsnCode).toBeNull();
  });

  it("uses singular 'night' for a one-night stay", () => {
    const items = invoiceItems([{ ...rooms[0], nights: 1 }], []);
    expect(items[0].description).toContain("(1 night)");
  });
});

describe("allocateUnpaid", () => {
  const orders = [
    { id: "o1", total: 400 },
    { id: "o2", total: 300 },
  ];

  it("puts the shortfall on the room invoice first", () => {
    const a = allocateUnpaid({ invoiceTotal: 5000, roomService: orders, unpaid: 1200 });
    expect(a.invoiceCredit).toBe(1200);
    expect(a.orderCredits).toEqual([]);
  });

  it("spills onto room-service orders newest first once the invoice is fully unpaid", () => {
    const a = allocateUnpaid({ invoiceTotal: 1000, roomService: orders, unpaid: 1500 });
    expect(a.invoiceCredit).toBe(1000);
    expect(a.orderCredits).toEqual([{ id: "o2", credit: 300 }, { id: "o1", credit: 200 }]);
  });

  it("records nothing when everything is paid", () => {
    const a = allocateUnpaid({ invoiceTotal: 1000, roomService: orders, unpaid: 0 });
    expect(a).toEqual({ invoiceCredit: 0, orderCredits: [] });
  });
});

describe("parseRoomNumbers", () => {
  it("expands ranges and lists, keeping order and dropping duplicates", () => {
    expect(parseRoomNumbers("101-103").numbers).toEqual(["101", "102", "103"]);
    expect(parseRoomNumbers("201, 202,205").numbers).toEqual(["201", "202", "205"]);
    expect(parseRoomNumbers("101-102, 102, 301").numbers).toEqual(["101", "102", "301"]);
  });

  it("keeps non-numeric names as they are", () => {
    expect(parseRoomNumbers("G1, Penthouse").numbers).toEqual(["G1", "Penthouse"]);
  });

  it("rejects empty input, backwards ranges and huge ranges", () => {
    expect(parseRoomNumbers("  ").error).toBeTruthy();
    expect(parseRoomNumbers("110-101").error).toContain("backwards");
    expect(parseRoomNumbers("1-5000").error).toContain("at most");
  });
});

describe("summarizeStays", () => {
  const stays = [
    { bookingId: "a", source: "makemytrip", commissionPercent: 15, checkIn: "2026-10-01", checkOut: "2026-10-04", rates: [3000, 2000] },
    { bookingId: "b", source: "walk_in", commissionPercent: 0, checkIn: "2026-10-03", checkOut: "2026-10-05", rates: [1000] },
    // straddles the start of the period — only 10-01 falls inside
    { bookingId: "c", source: "makemytrip", commissionPercent: 10, checkIn: "2026-09-29", checkOut: "2026-10-02", rates: [4000] },
    // entirely outside
    { bookingId: "d", source: "agent", commissionPercent: 10, checkIn: "2026-11-01", checkOut: "2026-11-03", rates: [5000] },
  ];

  it("counts only the nights inside the period", () => {
    const s = summarizeStays({ stays, from: "2026-10-01", to: "2026-10-05", sellableRooms: 4 });
    // a: 3 nights × 2 rooms = 6 room-nights, 3×3000 + 3×2000 = 15000
    // b: 2 nights × 1 = 2, 2000
    // c: 1 night × 1 = 1, 4000
    expect(s.roomNights).toBe(9);
    expect(s.roomRevenue).toBe(21000);
    expect(s.availableRoomNights).toBe(20); // 4 rooms × 5 days
    expect(s.occupancyPercent).toBe(45);
    expect(s.adr).toBeCloseTo(2333.33, 2);
    expect(s.revPar).toBe(1050);
  });

  it("splits revenue and commission by source", () => {
    const s = summarizeStays({ stays, from: "2026-10-01", to: "2026-10-05", sellableRooms: 4 });
    const mmt = s.bySource.find((x) => x.source === "makemytrip")!;
    expect(mmt.bookings).toBe(2);
    expect(mmt.revenue).toBe(19000);
    expect(mmt.commission).toBe(2250 + 400);
    expect(s.commissionTotal).toBe(2650);
    expect(s.bySource[0].source).toBe("makemytrip"); // largest first
    expect(s.bySource.find((x) => x.source === "agent")).toBeUndefined();
  });

  it("handles an empty period", () => {
    const s = summarizeStays({ stays: [], from: "2026-10-01", to: "2026-10-01", sellableRooms: 0 });
    expect(s).toMatchObject({ roomNights: 0, occupancyPercent: 0, adr: 0, revPar: 0, commissionTotal: 0 });
  });
});

describe("booking sources", () => {
  it("knows which sources take a commission", () => {
    expect(sourceTakesCommission("makemytrip")).toBe(true);
    expect(sourceTakesCommission("agent")).toBe(true);
    expect(sourceTakesCommission("walk_in")).toBe(false);
    expect(sourceIsOta("agent")).toBe(false);
    expect(sourceIsOta("booking_com")).toBe(true);
  });
});
