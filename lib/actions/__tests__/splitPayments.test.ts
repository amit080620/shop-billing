import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), requireSession: vi.fn() }));
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), revalidatePath: vi.fn() }));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SessionContext } from "@/lib/auth";
import { createBillCore } from "../bills";
import { resetFunctionChecks } from "@/lib/stockMoves";
import { billSchema } from "@/lib/validation/schemas";
import { paymentSummary, singleModeRows, splitError, splitPaid, topMode } from "@/lib/billPaymentSplit";
import { paymentMethodLabel } from "@/lib/format";

const session = {
  userId: "staff-1", email: "o@example.com", shopId: "shop-1", shopName: "Shop", staffName: "Owner", role: "owner", permissions: [],
  shopStateCode: "20", shopGstin: null, shopLogoUrl: null, shopUpiId: null, gstScheme: "regular", priceIncludesGst: false, businessType: "grocery",
  businessTypeLocked: false, enabledModules: [], plan: "pro_plus", planLimits: { billsPerMonth: null, products: null, staff: null, branches: 5 },
  onTrial: false, planExpired: false, trialEndsAt: null, paidUntil: null, plansReady: true, ownerPhone: null, fastBillingEnabled: false,
} as unknown as SessionContext;

const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const RICE = "22222222-2222-4222-8222-222222222222";
// ₹10 a unit, no GST, plenty in stock: a bill of n units comes to ₹10 × n.
const item = { id: RICE, name: "Rice", unit: "KG", price: 10, gst_percent: 0, hsn_code: null, track_inventory: true, stock_quantity: 1000, is_pharma: false, requires_prescription: false, has_warranty: false, warranty_months: null, mrp: null };

type Op = "select" | "insert" | "update" | "delete";
/** A database stand-in that remembers what was written and which functions were called. */
function fakeDb(opts: { setPayments?: { data?: unknown; error?: unknown }; customer?: boolean } = {}) {
  const writes: { table: string; op: Op; payload: unknown }[] = [];
  const rpc: [string, Record<string, unknown>][] = [];
  const answer = (table: string, op: Op, single: boolean) => {
    if (table === "bills" && op === "insert") return { data: { id: "bill-1" }, error: null };
    if (table === "bills" && op === "delete") return { data: [{ id: "bill-1" }], error: null };
    if (table === "bills" && op === "select" && single) return { data: null, error: null };
    if (table === "products") return single ? { data: { name: item.name, unit: item.unit }, error: null } : { data: [item], error: null };
    if (table === "shops") return { data: { block_oversell: true, loyalty_points_per_100: 0 }, error: null };
    if (table === "staff") return { data: { branch_id: null }, error: null };
    if (table === "customers") return single ? { data: { id: CUSTOMER, name: "Ramesh", phone: "9999900000", credit_limit: null, state: null, gstin: null }, error: null } : { data: [], error: null };
    return { data: single ? null : [], error: null };
  };
  const from = (table: string) => {
    let op: Op = "select";
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "neq", "not", "or", "gt", "gte", "lte", "order", "limit", "range", "is", "like", "ilike"]) q[m] = () => q;
    for (const m of ["insert", "update", "delete", "upsert"] as const) {
      q[m] = (payload?: unknown) => {
        op = m === "upsert" ? "insert" : m;
        writes.push({ table, op, payload });
        return q;
      };
    }
    q.single = async () => answer(table, op, true);
    q.maybeSingle = async () => answer(table, op, true);
    q.then = (resolve: (v: unknown) => void) => resolve(answer(table, op, false));
    return q;
  };
  const admin = {
    from,
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpc.push([name, args]);
      if (name === "next_invoice_number") return { data: 7, error: null };
      if (name === "set_bill_payments") return { data: opts.setPayments?.data ?? { result: "ok" }, error: opts.setPayments?.error ?? null };
      if (name === "take_bill_stock") return { data: { short: [] }, error: null };
      return { data: null, error: null };
    },
  };
  vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);
  const header = () => writes.find((w) => w.table === "bills" && w.op === "insert")?.payload as Record<string, unknown> | undefined;
  const payments = () => rpc.find(([n]) => n === "set_bill_payments")?.[1];
  return { writes, rpc, header, payments };
}

/** A bill of `units` × ₹10 of rice, parsed as the server would. */
const bill = (units: number, pay: { paidAmount?: number; paymentMethod?: "cash" | "card" | "upi" | "online" | "other"; payments?: unknown[]; customer?: boolean }) =>
  billSchema.parse({
    customerId: pay.customer === false ? null : CUSTOMER,
    items: [{ productId: RICE, description: "Rice", hsnCode: null, quantity: units, unitPrice: 10, gstPercent: 0, stockQuantity: units }],
    discountType: "flat",
    discountValue: 0,
    paidAmount: pay.paidAmount ?? 0,
    paymentMethod: pay.paymentMethod ?? "cash",
    ...(pay.payments ? { payments: pay.payments } : {}),
  });

beforeEach(() => {
  vi.clearAllMocks();
  resetFunctionChecks();
});

describe("the arithmetic (lib/billPaymentSplit)", () => {
  it("adds up the rows, drops zero rows, picks the mode that took most (the first of equals)", () => {
    expect(splitPaid([{ method: "cash", amount: 10 }, { method: "upi", amount: 90 }, { method: "card", amount: 0 }])).toEqual({ rows: [{ method: "cash", amount: 10, reference: null }, { method: "upi", amount: 90, reference: null }], paid: 100, method: "upi" });
    expect(topMode([{ method: "upi", amount: 200 }, { method: "card", amount: 200 }])).toBe("upi");
    expect(splitPaid([]).paid).toBe(0);
  });
  it("refuses more than the bill, and udhaar without a customer", () => {
    expect(splitError({ total: 100, nonMoney: 0, paid: 110, hasCustomer: true })).toMatch(/more than the bill/);
    expect(splitError({ total: 100, nonMoney: 30, paid: 80, hasCustomer: true })).toMatch(/more than the bill/);
    expect(splitError({ total: 100, nonMoney: 0, paid: 70, hasCustomer: false })).toMatch(/left unpaid/);
    expect(splitError({ total: 100, nonMoney: 0, paid: 70, hasCustomer: true })).toBeNull();
    expect(splitError({ total: 100, nonMoney: 20, paid: 80, hasCustomer: false })).toBeNull();
  });
  it("a single-mode bill's money row: the paid amount less old gold, scheme or prepaid balance", () => {
    expect(singleModeRows({ paidAmount: 100, nonMoney: 0, method: "upi" })).toEqual([{ method: "upi", amount: 100 }]);
    expect(singleModeRows({ paidAmount: 100, nonMoney: 30, method: "cash" })).toEqual([{ method: "cash", amount: 70 }]);
    expect(singleModeRows({ paidAmount: 0, nonMoney: 0, method: "cash" })).toEqual([]);
    expect(singleModeRows({ paidAmount: 50, nonMoney: 80, method: "cash" })).toEqual([]);
  });
  it("describes a split for the receipt; one mode reads as its name; online is 'Bank Transfer / Online'", () => {
    expect(paymentSummary([{ method: "cash", amount: 10 }, { method: "upi", amount: 90 }], "upi")).toBe("Cash ₹10.00 + UPI ₹90.00");
    expect(paymentSummary([{ method: "online", amount: 100 }], "online")).toBe("Bank Transfer / Online");
    expect(paymentMethodLabel("online")).toBe("Bank Transfer / Online");
  });
});

describe("the bill schema", () => {
  it("takes no payments (single mode, and offline bills queued before split payments) as before", () => {
    expect(bill(10, { paidAmount: 100 }).payments).toBeUndefined();
  });
  it("refuses negative and sub-paisa amounts, unknown modes, more than 10 rows and long references", () => {
    const parse = (payments: unknown[]) => billSchema.safeParse({ customerId: null, items: [{ productId: null, description: "x", hsnCode: null, quantity: 1, unitPrice: 1, gstPercent: 0 }], discountType: "flat", discountValue: 0, paidAmount: 0, payments }).success;
    expect(parse([{ method: "cash", amount: -1 }])).toBe(false);
    expect(parse([{ method: "cash", amount: 10.005 }])).toBe(false);
    expect(parse([{ method: "udhar", amount: 10 }])).toBe(false);
    expect(parse([{ method: "bank", amount: 10 }])).toBe(false);
    expect(parse(Array.from({ length: 11 }, () => ({ method: "cash", amount: 1 })))).toBe(false);
    expect(parse([{ method: "upi", amount: 10, reference: "x".repeat(101) }])).toBe(false);
    expect(parse([{ method: "upi", amount: 10.5, reference: "UPI-1" }, { method: "cash", amount: 0 }])).toBe(true);
  });
});

describe("making a bill (createBillCore)", () => {
  it("1 — ₹100: ₹10 cash + ₹90 UPI → header paid ₹100 in UPI (the larger), no udhaar; both rows written", async () => {
    const db = fakeDb();
    expect(await createBillCore(session, bill(10, { payments: [{ method: "cash", amount: 10 }, { method: "upi", amount: 90, reference: "UPI-4521" }] }))).toEqual({ billId: "bill-1", invoiceNumber: expect.any(String) });
    expect(db.header()).toMatchObject({ total: 100, paid_amount: 100, credit_amount: 0, payment_method: "upi" });
    expect(db.payments()).toEqual({ p_shop_id: "shop-1", p_bill_id: "bill-1", p_payments: [{ method: "cash", amount: 10 }, { method: "upi", amount: 90, reference: "UPI-4521" }], p_staff_id: "staff-1", p_non_money: 0 });
  });

  it("2 — ₹500: ₹100 cash + ₹200 UPI + ₹200 card", async () => {
    const db = fakeDb();
    await createBillCore(session, bill(50, { payments: [{ method: "cash", amount: 100 }, { method: "upi", amount: 200 }, { method: "card", amount: 200 }] }));
    expect(db.header()).toMatchObject({ total: 500, paid_amount: 500, credit_amount: 0, payment_method: "upi" });
    expect((db.payments()!.p_payments as unknown[]).length).toBe(3);
  });

  it("3 — ₹1,000: ₹300 cash + ₹400 UPI, ₹300 on the customer's udhaar (credit_amount, not a payment row)", async () => {
    const db = fakeDb();
    await createBillCore(session, bill(100, { payments: [{ method: "cash", amount: 300 }, { method: "upi", amount: 400 }] }));
    expect(db.header()).toMatchObject({ total: 1000, paid_amount: 700, credit_amount: 300, payment_method: "upi" });
    expect(db.payments()!.p_payments).toEqual([{ method: "cash", amount: 300 }, { method: "upi", amount: 400 }]);
  });

  it("a zero row is never saved", async () => {
    const db = fakeDb();
    await createBillCore(session, bill(10, { payments: [{ method: "cash", amount: 100 }, { method: "card", amount: 0 }] }));
    expect(db.payments()!.p_payments).toEqual([{ method: "cash", amount: 100 }]);
  });

  it("more than the bill: refused before an invoice number is taken, nothing written", async () => {
    const db = fakeDb();
    expect(await createBillCore(session, bill(10, { payments: [{ method: "cash", amount: 60 }, { method: "upi", amount: 50 }] }))).toEqual({ error: expect.stringMatching(/₹110.00, more than the bill's ₹100.00/) });
    expect(db.rpc.map(([n]) => n)).not.toContain("next_invoice_number");
    expect(db.writes.filter((w) => w.table === "bills")).toEqual([]);
  });

  it("a walk-in bill can't leave udhaar in split mode: refused before an invoice number", async () => {
    const db = fakeDb();
    expect(await createBillCore(session, bill(10, { customer: false, payments: [{ method: "cash", amount: 40 }] }))).toEqual({ error: expect.stringMatching(/₹60.00 is left unpaid/) });
    expect(db.rpc.map(([n]) => n)).not.toContain("next_invoice_number");
  });

  it("single mode keeps its old behaviour, and its one row is written", async () => {
    const db = fakeDb();
    await createBillCore(session, bill(10, { paidAmount: 100, paymentMethod: "card" }));
    expect(db.header()).toMatchObject({ paid_amount: 100, credit_amount: 0, payment_method: "card" });
    expect(db.payments()!.p_payments).toEqual([{ method: "card", amount: 100 }]);
    // A part payment: the rest is udhaar, as before (no customer check added for single mode).
    const part = fakeDb();
    await createBillCore(session, bill(10, { paidAmount: 30, paymentMethod: "cash" }));
    expect(part.header()).toMatchObject({ paid_amount: 30, credit_amount: 70 });
    expect(part.payments()!.p_payments).toEqual([{ method: "cash", amount: 30 }]);
    // Full udhaar: no row at all.
    const none = fakeDb();
    await createBillCore(session, bill(10, { paidAmount: 0 }));
    expect(none.payments()!.p_payments).toEqual([]);
    // Cash handed over beyond the bill is still capped at the bill (change given back), as before.
    const over = fakeDb();
    await createBillCore(session, bill(10, { paidAmount: 500, paymentMethod: "cash" }));
    expect(over.header()).toMatchObject({ paid_amount: 100, credit_amount: 0 });
    expect(over.payments()!.p_payments).toEqual([{ method: "cash", amount: 100 }]);
  });

  it("the payments are written before any stock moves; refused → the bill is taken back, stock untouched", async () => {
    const db = fakeDb({ setPayments: { error: { message: "over_allocated", code: "22023" } } });
    expect(await createBillCore(session, bill(10, { payments: [{ method: "cash", amount: 100 }] }))).toEqual({ error: expect.stringMatching(/more than the bill/) });
    const names = db.rpc.map(([n]) => n);
    expect(names).toContain("set_bill_payments");
    expect(names).not.toContain("take_bill_stock");
    expect(db.writes).toContainEqual(expect.objectContaining({ table: "bills", op: "delete" }));
  });

  it("no answer while writing the payments: the bill is taken back (nothing kept half-done)", async () => {
    const db = fakeDb({ setPayments: { error: { message: "fetch failed", code: "" } } });
    expect(await createBillCore(session, bill(10, { payments: [{ method: "cash", amount: 100 }] }))).toEqual({ error: expect.stringMatching(/payments couldn't be saved/) });
    expect(db.rpc.map(([n]) => n)).not.toContain("take_bill_stock");
  });

  it("before migration 0061 (no function): the bill is made the old way, one mode", async () => {
    const db = fakeDb({ setPayments: { error: { message: "Could not find the function", code: "PGRST202" } } });
    expect(await createBillCore(session, bill(10, { paidAmount: 100, paymentMethod: "upi" }))).toEqual({ billId: "bill-1", invoiceNumber: expect.any(String) });
    expect(db.header()).toMatchObject({ paid_amount: 100, payment_method: "upi" });
    expect(db.rpc.map(([n]) => n)).toContain("take_bill_stock");
  });

  it("an offline bill queued with split payments syncs them; one queued before (no payments) syncs as single mode", async () => {
    const offline = { clientRef: "OFFLINE-1730000000000-abcd", issuedAt: new Date() };
    const split = fakeDb();
    await createBillCore(session, bill(10, { payments: [{ method: "cash", amount: 20 }, { method: "upi", amount: 80 }] }), offline);
    expect(split.payments()!.p_payments).toEqual([{ method: "cash", amount: 20 }, { method: "upi", amount: 80 }]);
    const old = fakeDb();
    await createBillCore(session, bill(10, { paidAmount: 100, paymentMethod: "cash" }), offline);
    expect(old.payments()!.p_payments).toEqual([{ method: "cash", amount: 100 }]);
  });
});
