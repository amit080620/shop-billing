// Refunds go back only the way the money came in, and never more than came in (point #82):
// lib/billPaymentSplit refundRoom / refundError, which the Return screen and the server both use.
import { describe, expect, it } from "vitest";
import { onlyUdhaar, refundError, refundRoom } from "../billPaymentSplit";

describe("refundRoom — a bill with payment rows (migration 0061)", () => {
  const rows = [
    { method: "cash" as const, amount: 100 },
    { method: "upi" as const, amount: 400 },
  ];

  it("each mode it took money in, up to what that mode took", () => {
    expect(refundRoom({ paid: 500, method: "upi", nonMoney: 0, rows, refunds: [] })).toEqual([
      { method: "cash", left: 100 },
      { method: "upi", left: 400 },
    ]);
  });

  it("an earlier refund lowers only its own mode; an udhaar adjustment lowers none", () => {
    const room = refundRoom({ paid: 500, method: "upi", nonMoney: 0, rows, refunds: [{ method: "upi", total: 150 }, { method: "credit_adjustment", total: 999 }] });
    expect(room).toEqual([
      { method: "cash", left: 100 },
      { method: "upi", left: 250 },
    ]);
  });

  it("a mode with nothing left is not offered", () => {
    expect(refundRoom({ paid: 500, method: "upi", nonMoney: 0, rows, refunds: [{ method: "cash", total: 100 }] })).toEqual([{ method: "upi", left: 400 }]);
  });

  it("the paid amount's non-money part (old gold) is never in the rows, so never refundable as money", () => {
    // ₹300 old gold + ₹200 UPI: paid 500, one row of 200.
    expect(refundRoom({ paid: 500, method: "upi", nonMoney: 999, rows: [{ method: "upi", amount: 200 }], refunds: [] })).toEqual([{ method: "upi", left: 200 }]);
  });
});

describe("refundRoom — a bill without rows (before split payments, or one that took no money)", () => {
  it("fully on udhaar: nothing to refund as money", () => {
    expect(refundRoom({ paid: 0, method: "cash", nonMoney: 0, rows: [], refunds: [] })).toEqual([]);
  });

  it("part paid: its one mode, up to the money paid — the udhaar part is not refundable as money", () => {
    expect(refundRoom({ paid: 400, method: "cash", nonMoney: 0, rows: [], refunds: [] })).toEqual([{ method: "cash", left: 400 }]);
  });

  it("old gold, a scheme or prepaid balance inside the paid amount is not money", () => {
    expect(refundRoom({ paid: 500, method: "cash", nonMoney: 300, rows: [], refunds: [] })).toEqual([{ method: "cash", left: 200 }]);
    expect(refundRoom({ paid: 500, method: "cash", nonMoney: 500, rows: [], refunds: [] })).toEqual([]);
  });

  it("every earlier money refund counts — in any mode (older returns could pick any)", () => {
    const refunds = [{ method: "upi", total: 150 }, { method: "credit_adjustment", total: 1000 }];
    expect(refundRoom({ paid: 400, method: "cash", nonMoney: 0, rows: [], refunds })).toEqual([{ method: "cash", left: 250 }]);
  });

  it("repeated returns: once everything paid is refunded, no money mode is left", () => {
    const refunds = [{ method: "cash", total: 250 }, { method: "cash", total: 150 }];
    expect(refundRoom({ paid: 400, method: "cash", nonMoney: 0, rows: [], refunds })).toEqual([]);
  });

  it("a bill whose mode isn't a money mode offers none", () => {
    expect(refundRoom({ paid: 400, method: "adjustment", nonMoney: 0, rows: [], refunds: [] })).toEqual([]);
  });
});

describe("refundError", () => {
  const room = [
    { method: "cash" as const, left: 100 },
    { method: "upi" as const, left: 250 },
  ];

  it("within what the mode took: allowed", () => {
    expect(refundError(room, "upi", 250, true)).toBeNull();
    expect(refundError(room, "cash", 99.99, true)).toBeNull();
  });

  it("more than the mode took: refused, saying how much can go back", () => {
    expect(refundError(room, "upi", 250.01, true)).toBe("Only ₹250.00 can be refunded by UPI on this bill — what it took, less earlier refunds. Return fewer items, or adjust it against the customer's udhaar.");
  });

  it("a mode the bill wasn't paid in: refused, naming the modes it was", () => {
    expect(refundError(room, "card", 10, true)).toBe("This bill wasn't paid by Card. Refund it by Cash or UPI, or adjust it against the customer's udhaar.");
    expect(refundError(room, "online", 10, false)).toBe("This bill wasn't paid by Bank Transfer / Online. Refund it by Cash or UPI.");
  });

  it("an udhaar bill: no money refund at all", () => {
    expect(refundError([], "cash", 10, true)).toBe("No money is left to refund on this bill — it took none, or it was already refunded. Adjust the return against the customer's udhaar instead.");
  });

  it("adjusting against udhaar gives no money back, so it isn't limited here", () => {
    expect(refundError([], "credit_adjustment", 5000, true)).toBeNull();
  });

  it("a return worth nothing refunds nothing", () => {
    expect(refundError([], "cash", 0, false)).toBeNull();
  });

  it("an unknown way of refunding is refused", () => {
    expect(refundError(room, "bitcoin", 10, true)).toBe("Pick how the refund was given.");
  });
});

describe("onlyUdhaar — the receipt says Udhaar", () => {
  it("only when no money was paid and something is left on udhaar", () => {
    expect(onlyUdhaar(0, 1763)).toBe(true);
    expect(onlyUdhaar(500, 1263)).toBe(false); // part paid: the mode stays
    expect(onlyUdhaar(0, 0)).toBe(false); // a ₹0 bill, or one old gold covered fully
    expect(onlyUdhaar(1763, 0)).toBe(false);
  });
});

describe("refundError — udhaar adjustment needs a customer", () => {
  it("a walk-in bill (no customer) can't be adjusted against udhaar: there is no khata", () => {
    expect(refundError([], "credit_adjustment", 50, false)).toBe("This bill has no customer, so there is no udhaar khata to adjust — refund it in money instead.");
  });
  it("a customer's bill still can, whatever the money room", () => {
    expect(refundError([], "credit_adjustment", 50, true)).toBeNull();
    expect(refundError([{ method: "cash", left: 10 }], "credit_adjustment", 500, true)).toBeNull();
  });
});
