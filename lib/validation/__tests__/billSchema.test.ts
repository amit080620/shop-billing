import { describe, it, expect } from "vitest";
import { billSchema } from "../schemas";

const validItem = {
  productId: "550e8400-e29b-41d4-a716-446655440000",
  description: "Test Item",
  quantity: 1,
  unitPrice: 100,
  gstPercent: 18,
};

const baseBill = {
  customerId: null,
  items: [validItem],
  discountType: "flat" as const,
  discountValue: 0,
  paidAmount: 118,
};

describe("billSchema — genuinely the first line of defense against bad data reaching the database", () => {
  it("genuinely accepts a well-formed bill", () => {
    const result = billSchema.safeParse(baseBill);
    expect(result.success).toBe(true);
  });

  it("genuinely rejects a bill with an empty cart", () => {
    const result = billSchema.safeParse({ ...baseBill, items: [] });
    expect(result.success).toBe(false);
  });

  it("genuinely rejects a negative quantity", () => {
    const result = billSchema.safeParse({
      ...baseBill,
      items: [{ ...validItem, quantity: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("genuinely rejects a zero quantity", () => {
    const result = billSchema.safeParse({
      ...baseBill,
      items: [{ ...validItem, quantity: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("genuinely rejects a negative unit price", () => {
    const result = billSchema.safeParse({
      ...baseBill,
      items: [{ ...validItem, unitPrice: -50 }],
    });
    expect(result.success).toBe(false);
  });

  it("genuinely rejects a GST percent above 100", () => {
    const result = billSchema.safeParse({
      ...baseBill,
      items: [{ ...validItem, gstPercent: 150 }],
    });
    expect(result.success).toBe(false);
  });

  it("genuinely rejects a negative GST percent", () => {
    const result = billSchema.safeParse({
      ...baseBill,
      items: [{ ...validItem, gstPercent: -5 }],
    });
    expect(result.success).toBe(false);
  });

  it("genuinely accepts GST at the genuine boundary values 0 and 100", () => {
    expect(billSchema.safeParse({ ...baseBill, items: [{ ...validItem, gstPercent: 0 }] }).success).toBe(true);
    expect(billSchema.safeParse({ ...baseBill, items: [{ ...validItem, gstPercent: 100 }] }).success).toBe(true);
  });

  it("genuinely rejects a negative discount value", () => {
    const result = billSchema.safeParse({ ...baseBill, discountValue: -10 });
    expect(result.success).toBe(false);
  });

  it("genuinely rejects a negative paidAmount", () => {
    const result = billSchema.safeParse({ ...baseBill, paidAmount: -1 });
    expect(result.success).toBe(false);
  });

  it("genuinely rejects an item with an empty description", () => {
    const result = billSchema.safeParse({
      ...baseBill,
      items: [{ ...validItem, description: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("genuinely rejects an invalid discountType value", () => {
    const result = billSchema.safeParse({ ...baseBill, discountType: "half-price" });
    expect(result.success).toBe(false);
  });

  it("genuinely rejects an invalid paymentMethod", () => {
    const result = billSchema.safeParse({ ...baseBill, paymentMethod: "bitcoin" });
    expect(result.success).toBe(false);
  });

  it("genuinely defaults paymentMethod to cash when omitted", () => {
    const withoutPaymentMethod = { ...baseBill } as Record<string, unknown>;
    delete withoutPaymentMethod.paymentMethod;
    const result = billSchema.safeParse(withoutPaymentMethod);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.paymentMethod).toBe("cash");
  });

  it("genuinely accepts a walk-in customer (customerId: null)", () => {
    const result = billSchema.safeParse({ ...baseBill, customerId: null });
    expect(result.success).toBe(true);
  });

  it("genuinely rejects a malformed (non-UUID) customerId", () => {
    const result = billSchema.safeParse({ ...baseBill, customerId: "not-a-real-uuid" });
    expect(result.success).toBe(false);
  });

  it("genuinely coerces a string quantity/price into a number (form data always arrives as strings)", () => {
    const result = billSchema.safeParse({
      ...baseBill,
      items: [{ ...validItem, quantity: "3" as unknown as number, unitPrice: "50" as unknown as number }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0].quantity).toBe(3);
      expect(result.data.items[0].unitPrice).toBe(50);
    }
  });

  it("genuinely accepts multiple line items in one bill", () => {
    const result = billSchema.safeParse({
      ...baseBill,
      items: [validItem, { ...validItem, description: "Second Item" }],
    });
    expect(result.success).toBe(true);
  });
});
