import { describe, expect, it } from "vitest";
import { buyerOf, stateFromGstin } from "../gstBuyer";
import { billSchema } from "../validation/schemas";

describe("stateFromGstin", () => {
  it("reads the registered state from the first two digits", () => {
    expect(stateFromGstin("27ABCDE1234F1Z5")).toEqual({ code: "27", name: "Maharashtra" });
    expect(stateFromGstin("29ABCDE1234F1Z5").name).toBe("Karnataka");
  });
});

describe("buyerOf", () => {
  const customer = { name: "Amit", gstin: null, address: "Pune", state: "Maharashtra", state_code: "27" };

  it("prefers what was frozen on the bill — e.g. the employer an employee billed", () => {
    const b = buyerOf({ buyer_name: "ABC Pvt Ltd", buyer_gstin: "29ABCDE1234F1Z5", buyer_state: "Karnataka", buyer_state_code: "29" }, customer);
    expect(b).toMatchObject({ name: "ABC Pvt Ltd", gstin: "29ABCDE1234F1Z5", stateCode: "29" });
  });

  it("falls back to the customer for a bill made before the buyer was frozen", () => {
    expect(buyerOf({}, customer)).toMatchObject({ name: "Amit", gstin: null, stateCode: "27" });
  });

  it("is nobody for a walk-in", () => {
    expect(buyerOf({}, null)).toBeNull();
  });
});

describe("billSchema B2B", () => {
  const base = { customerId: null, items: [{ description: "Item", quantity: 1, unitPrice: 100, gstPercent: 18 }], discountType: "flat", discountValue: 0, paidAmount: 118 };

  it("needs a business name and a valid GSTIN when the B2B switch is on", () => {
    expect(billSchema.safeParse({ ...base, b2b: true, buyerName: "", buyerGstin: "" }).success).toBe(false);
    expect(billSchema.safeParse({ ...base, b2b: true, buyerName: "ABC Pvt Ltd", buyerGstin: "not-a-gstin" }).success).toBe(false);
    const ok = billSchema.safeParse({ ...base, b2b: true, buyerName: "ABC Pvt Ltd", buyerGstin: "27abcde1234f1z5" });
    expect(ok.success).toBe(true);
    expect(ok.success && ok.data.buyerGstin).toBe("27ABCDE1234F1Z5");
  });

  it("leaves ordinary bills (and other modules, which send no switch) alone", () => {
    expect(billSchema.safeParse(base).success).toBe(true);
    expect(billSchema.safeParse({ ...base, b2b: false }).success).toBe(true);
  });
});
