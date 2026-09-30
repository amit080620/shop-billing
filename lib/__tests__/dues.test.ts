import { describe, expect, it } from "vitest";
import { bucketOf, partyDues, pendingBills } from "../dues";

const bills = [
  { id: "b2", number: "INV/2", date: "2026-09-01", due: "2026-09-16", credit: 5000 },
  { id: "b1", number: "INV/1", date: "2026-08-01", due: "2026-08-16", credit: 3000 },
  { id: "b3", number: "INV/3", date: "2026-09-25", due: "2026-10-10", credit: 2000 },
];

describe("pendingBills", () => {
  it("settles the oldest bill first", () => {
    const p = pendingBills(bills, 4000, "2026-09-30");
    expect(p.map((b) => [b.number, b.pending, b.overdueDays])).toEqual([
      ["INV/2", 4000, 14],
      ["INV/3", 2000, 0],
    ]);
  });
  it("nothing pending once everything is paid", () => {
    expect(pendingBills(bills, 10000, "2026-09-30")).toEqual([]);
  });
});

describe("partyDues", () => {
  it("splits what is owed into overdue buckets", () => {
    const d = partyDues(pendingBills(bills, 0, "2026-09-30"));
    expect(d.owed).toBe(10000);
    expect(d.overdue).toBe(8000);
    expect(d.maxOverdueDays).toBe(45);
    expect(d.buckets).toEqual({ not_due: 2000, "1-30": 5000, "31-60": 3000, "61-90": 0, "90+": 0 });
  });
  it("names the buckets", () => {
    expect([0, 1, 30, 31, 90, 91].map(bucketOf)).toEqual(["not_due", "1-30", "1-30", "31-60", "61-90", "90+"]);
  });
});
