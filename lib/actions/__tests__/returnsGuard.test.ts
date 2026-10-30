// The return workflow's safety (R1–R5): one database call does the whole return; what happens on
// each of its answers, and the step-by-step way used before migration 0060.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), requireSession: vi.fn() }));
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), revalidatePath: vi.fn() }));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireSession, type SessionContext } from "@/lib/auth";
import { createReturnAction, retryReturnStockAction } from "../returns";
import { resetFunctionChecks } from "@/lib/stockMoves";

const session = {
  userId: "staff-1", email: "o@example.com", shopId: "shop-1", shopName: "Shop", staffName: "Owner", role: "owner", permissions: [],
  shopStateCode: "27", shopGstin: null, shopLogoUrl: null, shopUpiId: null, gstScheme: "regular", priceIncludesGst: false, businessType: "grocery",
  businessTypeLocked: false, enabledModules: [], plan: "pro_plus", planLimits: { billsPerMonth: null, products: null, staff: null, branches: 5 },
  onTrial: false, planExpired: false, trialEndsAt: null, paidUntil: null, plansReady: true, ownerPhone: null, fastBillingEnabled: false,
} as unknown as SessionContext;

const MISSING = { error: { message: "Could not find the function", code: "PGRST202" } };
type Op = "select" | "insert" | "update" | "delete";
type Answer = { data?: unknown; error?: unknown };

/** A database stand-in: answers by table and kind of query (an answer can depend on how many times
 * it was asked), and remembers every write and call. */
function fakeDb(opts: { rpc?: Record<string, Answer>; answer?: (table: string, op: Op, single: boolean, n: number) => Answer | undefined }) {
  const writes: { table: string; op: Op; row?: unknown }[] = [];
  const rpc: [string, Record<string, unknown>][] = [];
  const asked: Record<string, number> = {};
  const answer = (table: string, op: Op, single: boolean): Answer => {
    const key = `${table}:${op}:${single}`;
    const n = (asked[key] = (asked[key] ?? 0) + 1);
    const own = opts.answer?.(table, op, single, n);
    if (own) return own;
    if (table === "shops") return { data: { manager_pin: null } };
    if (table === "bills" && op === "select" && single) return { data: { id: "bill-1", customer_id: "cust-1", status: "active" } };
    if (table === "bill_items") return { data: [{ id: "bi-1", product_id: "p1", product_name: "Soap", quantity: 5, unit_price: 10, gst_percent: 0, batch_id: null, line_subtotal: 50, cgst_amount: 0, sgst_amount: 0, igst_amount: 0 }] };
    if (table === "returns" && op === "insert") return { data: { id: "ret-legacy" } };
    if (table === "return_items" && op === "insert") return { data: [{ id: "ri-1", bill_item_id: "bi-1", product_id: "p1", quantity: 2 }] };
    if (table === "products") return { data: [{ id: "p1", track_inventory: true }] };
    return { data: single ? null : [] };
  };
  const from = (table: string) => {
    let op: Op = "select";
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "neq", "not", "or", "gt", "gte", "lte", "order", "limit", "is"]) q[m] = () => q;
    for (const m of ["insert", "update", "delete", "upsert"] as const) {
      q[m] = (row?: unknown) => {
        op = m === "upsert" ? "insert" : m;
        writes.push({ table, op, row });
        return q;
      };
    }
    const done = (single: boolean) => {
      const a = answer(table, op, single);
      return { data: a.data ?? null, error: a.error ?? null };
    };
    q.single = async () => done(true);
    q.maybeSingle = async () => done(true);
    q.then = (resolve: (v: unknown) => void) => resolve(done(false));
    return q;
  };
  const admin = {
    from,
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpc.push([name, args]);
      if (name === "next_return_number") return { data: 3, error: null };
      const a = opts.rpc?.[name];
      return { data: a?.data ?? null, error: a?.error ?? null };
    },
  };
  vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);
  return { writes, rpc, audit: () => writes.filter((w) => w.table === "audit_logs").map((w) => (w.row as { action: string }).action) };
}

const form = (refund = "credit_adjustment", clientRef = "ref-12345678") => {
  const f = new FormData();
  f.set("billId", "bill-1");
  f.set("lines", JSON.stringify([{ billItemId: "bi-1", quantity: 2 }]));
  f.set("refundMethod", refund);
  f.set("reason", "damaged");
  f.set("clientRef", clientRef);
  return f;
};
/** A server action's redirect, or its answer. */
async function run(f: FormData): Promise<{ redirect?: string; result?: unknown }> {
  try {
    return { result: await createReturnAction(null, f) };
  } catch (e) {
    const digest = String((e as { digest?: string }).digest ?? "");
    if (digest.startsWith("NEXT_REDIRECT")) return { redirect: digest.split(";")[2] };
    throw e;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  resetFunctionChecks();
  vi.mocked(requireSession).mockResolvedValue(session);
});

describe("a return through record_return (migration 0060)", () => {
  it("saved: one call carries the whole return, this form's id and the udhaar note; then the credit note opens", async () => {
    const db = fakeDb({ rpc: { record_return: { data: { result: "ok", return_id: "ret-1" } } } });
    expect(await run(form())).toEqual({ redirect: "/returns/ret-1" });
    const [, args] = db.rpc.find(([n]) => n === "record_return")!;
    expect(args).toMatchObject({ p_shop_id: "shop-1", p_bill_id: "bill-1", p_client_ref: "ref-12345678", p_credit_note: "Return CN/2026-27/00003 adjusted against udhaar" });
    expect(args.p_lines).toEqual([expect.objectContaining({ bill_item_id: "bi-1", quantity: 2 })]);
    // Nothing written by the app itself: no credit note, lines, stock or adjustment of its own.
    expect(db.writes.filter((w) => w.op !== "select")).toEqual([]);
  });

  it("the same request sent again after a lost answer: opens the credit note already made", async () => {
    fakeDb({ rpc: { record_return: { data: { result: "duplicate", return_id: "ret-1" } } } });
    expect(await run(form())).toEqual({ redirect: "/returns/ret-1" });
  });

  it("more than is left (another staff member just returned some): refused with what is left", async () => {
    fakeDb({ rpc: { record_return: { data: { result: "too_many", bill_item_id: "bi-1", left: 1 } } } });
    expect(await run(form())).toEqual({ result: { error: 'Only 1 × "Soap" left to return on this bill — another return was just made.' } });
  });

  it("the bill was voided meanwhile: refused, and nothing was written by the app", async () => {
    const db = fakeDb({ rpc: { record_return: { data: { result: "voided" } } } });
    expect(await run(form())).toEqual({ result: { error: "This bill was voided just now — its goods are already back in stock, so nothing was returned." } });
    expect(db.writes.filter((w) => w.op !== "select")).toEqual([]);
  });

  it("an item no longer in the shop's list, or a medicine batch that doesn't match: refused, nothing returned", async () => {
    fakeDb({ rpc: { record_return: { error: { message: "unknown_item", code: "P0002" } } } });
    expect(await run(form())).toEqual({ result: { error: "An item on this bill is no longer in this shop's list, so its stock can't go back — nothing was returned." } });
    fakeDb({ rpc: { record_return: { error: { message: "batch_mismatch", code: "22023" } } } });
    expect(await run(form())).toEqual({ result: { error: "A returned medicine's batch is missing or doesn't match the item, so it can't go back to its batch — nothing was returned." } });
  });

  it("the same request id already used for another bill: refused with a clear message", async () => {
    fakeDb({ rpc: { record_return: { error: { message: "request_conflict", code: "23505" } } } });
    expect(await run(form())).toEqual({ result: { error: "This return form was already used for another bill — reload the page and try again." } });
  });

  it("a form that sent no id still sends one (made on the server); its no-answer message doesn't promise a safe retry", async () => {
    const db = fakeDb({ rpc: { record_return: { error: { message: "fetch failed", code: "" } } } });
    const r = await run(form("cash", ""));
    expect(db.rpc.find(([n]) => n === "record_return")?.[1].p_client_ref).toMatch(/^[0-9a-f-]{36}$/);
    expect(r).toEqual({ result: { error: "The return couldn't be confirmed (the connection dropped). Check this bill's returns before trying again." } });
  });

  it("no answer (it may have been saved): written down, and Save can be pressed again safely", async () => {
    const db = fakeDb({ rpc: { record_return: { error: { message: "fetch failed", code: "" } } } });
    expect(await run(form())).toEqual({ result: { error: "The return couldn't be confirmed (the connection dropped). Press Save again — it won't be saved twice." } });
    expect(db.audit()).toEqual(["return_not_confirmed"]);
  });
});

describe("before migration 0060: step by step, every step checked", () => {
  it("a bill voided meanwhile and the credit note can't be removed: written down and the counter told", async () => {
    const db = fakeDb({
      rpc: { record_return: MISSING, give_back_return: { data: "voided" } },
      answer: (table, op) => (table === "returns" && op === "delete" ? { error: { message: "fetch failed" } } : undefined),
    });
    const r = await run(form("cash"));
    expect(r.result).toEqual({ error: expect.stringMatching(/voided just now.*Credit note CN\/2026-27\/00003 could not be removed/) });
    expect(db.writes.filter((w) => w.table === "returns" && w.op === "delete")).toHaveLength(2);
    expect(db.audit()).toEqual(["return_cleanup_failed"]);
  });

  it("the credit note is removed when its bill was voided meanwhile (delete checked)", async () => {
    const db = fakeDb({ rpc: { record_return: MISSING, give_back_return: { data: "voided" } } });
    expect((await run(form("cash"))).result).toEqual({ error: "This bill was voided just now — its goods are already back in stock, so nothing was returned." });
    expect(db.writes.filter((w) => w.table === "returns" && w.op === "delete")).toHaveLength(1);
    expect(db.audit()).toEqual([]);
  });

  it("no udhaar adjustment against a bill voided after the goods went back", async () => {
    const db = fakeDb({
      rpc: { record_return: MISSING, give_back_return: { data: "ok" } },
      // The bill is active when the return starts, voided by the time the adjustment would be written.
      answer: (table, op, single, n) => (table === "bills" && op === "select" && single && n > 1 ? { data: { status: "voided" } } : undefined),
    });
    expect(await run(form())).toEqual({ redirect: "/returns/ret-legacy" });
    expect(db.writes.filter((w) => w.table === "payments")).toEqual([]);
    expect(db.audit()).toEqual(["return_adjustment_skipped"]);
  });

  it("goods not back (call failed): saved, written down, offered again on the credit note", async () => {
    const db = fakeDb({ rpc: { record_return: MISSING, give_back_return: { error: { message: "fetch failed", code: "" } } } });
    expect(await run(form("cash"))).toEqual({ redirect: "/returns/ret-legacy" });
    expect(db.audit()).toEqual(["return_stock_not_restored"]);
  });
});

describe("Put back in stock (retry)", () => {
  it("sends only lines not yet back; give_back_return moves each once", async () => {
    const db = fakeDb({
      rpc: { give_back_return: { data: "ok" } },
      answer: (table) =>
        table === "returns"
          ? { data: { id: "ret-1", return_number: "CN/1" } }
          : table === "return_items"
            ? { data: [{ id: "ri-1", product_id: "p1", quantity: 2, stock_back: 0 }, { id: "ri-2", product_id: "p1", quantity: 1, stock_back: 1 }, { id: "ri-3", product_id: "p1", quantity: 4, stock_back: null }] }
            : undefined,
    });
    expect(await retryReturnStockAction("ret-1")).toEqual({});
    expect(db.rpc.find(([n]) => n === "give_back_return")?.[1]).toEqual({ p_shop_id: "shop-1", p_return_id: "ret-1", p_lines: [{ return_item_id: "ri-1", product_id: "p1", quantity: 2 }] });
    expect(db.audit()).toEqual(["return_stock_restored"]);
  });

  it("nothing left to put back: no call at all", async () => {
    const db = fakeDb({ answer: (table) => (table === "returns" ? { data: { id: "ret-1", return_number: "CN/1" } } : table === "return_items" ? { data: [{ id: "ri-1", product_id: "p1", quantity: 2, stock_back: 2 }] } : undefined) });
    expect(await retryReturnStockAction("ret-1")).toEqual({});
    expect(db.rpc).toEqual([]);
  });
});
