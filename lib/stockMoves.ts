import "server-only";
import type { createSupabaseAdminClient } from "./supabase/admin";
import { logAuditEvent } from "./audit";
import { shortMessage } from "./stockRule";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Where a stock change comes from — written on every refused or short stock change. */
export type StockSource =
  | "bill"
  | "bill_edit"
  | "bill_void"
  | "return"
  | "purchase"
  | "restaurant"
  | "kitchen"
  | "stock_count"
  | "pharmacy"
  | "challan";

export type StockLine = { productId: string | null | undefined; quantity: number };

/** Stock is kept to 3 decimals (numeric(12,3)): a gram of a kilo item, a ml of a litre. */
export const round3 = (n: number) => Math.round(n * 1000) / 1000;

export type StockMoveResult =
  /** Moved — every line, or (allowShort) as much as there was. */
  | { ok: true }
  /** Refused by the shop's stock: nothing moved. `error` names the item, what is in stock and what was asked. */
  | { ok: false; refused: true; error: string }
  /** Couldn't be sent or answered: whether it moved is unknown. */
  | { ok: false; refused: false; error: string };

/** What an allowed short move left untaken: asked for `requested`, `taken` came off. */
export type Short = { product_id: string; requested: number; available: number; taken: number };


/** Lines of an item added up; ones without an item dropped. A quantity that isn't a number above
 * zero refuses the whole move — it is never turned into something else. */
export function stockLines(lines: StockLine[]): { lines: { product_id: string; quantity: number }[] } | { bad: StockLine } {
  const sum = new Map<string, number>();
  for (const l of lines) {
    if (!l.productId) continue;
    const q = Number(l.quantity);
    if (!Number.isFinite(q) || q <= 0) return { bad: l };
    sum.set(l.productId, (sum.get(l.productId) ?? 0) + q);
  }
  // A line smaller than stock keeps track of (under half a gram) moves nothing.
  return { lines: [...sum].map(([product_id, quantity]) => ({ product_id, quantity: round3(quantity) })).filter((l) => l.quantity > 0) };
}

/** What Postgres said about a refused move: {product_id, requested, available}. */
export function refusalDetail(details: unknown): { productId: string; requested: number; available: number } | null {
  try {
    const d = JSON.parse(String(details)) as { product_id?: string; requested?: number; available?: number };
    if (!d.product_id) return null;
    return { productId: d.product_id, requested: Number(d.requested), available: Number(d.available) };
  } catch {
    return null;
  }
}

/** The item Postgres said isn't the shop's ({product_id}). */
export function unknownItem(details: unknown): string | null {
  try {
    return (JSON.parse(String(details)) as { product_id?: string }).product_id ?? null;
  } catch {
    return null;
  }
}

/** Writes down a refused or short stock change: item, quantity, where it came from, when (the entry's
 * own time). No customer details. Never throws. */
export async function logStockProblem(
  admin: Admin,
  p: { shopId: string; staffId: string | null; source: StockSource; sourceId?: string | null; productId: string | null; requested: number; available?: number | null; taken?: number; reason: "insufficient" | "short" | "invalid_quantity" | "unknown_outcome" | "unknown_item" },
) {
  await logAuditEvent({
    admin,
    shopId: p.shopId,
    staffId: p.staffId,
    action: p.reason === "short" ? "stock_short" : "stock_refused",
    entityType: "product",
    entityId: p.productId,
    details: {
      reason: p.reason,
      source: p.source,
      sourceId: p.sourceId ?? null,
      requested: p.requested,
      ...(p.available != null ? { available: p.available } : {}),
      ...(p.taken != null ? { taken: p.taken } : {}),
    },
  });
}

// Database functions found missing (migration 0060 not run, or the API's list of functions not
// reloaded yet), and when. Never for good: after RECHECK_MS the function is tried again, so a
// server that started before the migration picks it up within half a minute of it being there.
const RECHECK_MS = 30_000;
const missingSince = new Map<string, number>();

/** Is this database function known to be missing just now? */
export function functionMissing(name: string): boolean {
  const at = missingSince.get(name);
  if (at === undefined) return false;
  if (Date.now() - at < RECHECK_MS) return true;
  missingSince.delete(name);
  return false;
}

/** After calling a database function: was the error that the function isn't there? (Remembered for
 * RECHECK_MS.) A call that went through clears it. */
export function noteFunctionResult(name: string, error: { code?: string; message?: string } | null): boolean {
  const missing = !!error && (error.code === "PGRST202" || error.code === "42883");
  if (missing) missingSince.set(name, Date.now());
  else missingSince.delete(name);
  return missing;
}

/** For tests: forget what was found missing. */
export function resetFunctionChecks() {
  missingSince.clear();
}

type Origin = { shopId: string; staffId: string | null; source: StockSource; sourceId?: string | null };

async function refusal(admin: Admin, opts: Origin, details: unknown): Promise<StockMoveResult> {
  const d = refusalDetail(details);
  const { data: item } = d ? await admin.from("products").select("name, unit").eq("id", d.productId).eq("shop_id", opts.shopId).maybeSingle() : { data: null };
  if (d) await logStockProblem(admin, { shopId: opts.shopId, staffId: opts.staffId, source: opts.source, sourceId: opts.sourceId, productId: d.productId, requested: d.requested, available: d.available, reason: "insufficient" });
  return { ok: false, refused: true, error: d ? shortMessage(item?.name ?? "An item", d.available, d.requested, item?.unit ?? "") : "Not enough stock for this." };
}

/** Writes down each shortfall a move answered with ({short: […]}), and hands them on. */
async function noteShort(admin: Admin, opts: Origin, data: unknown): Promise<Short[]> {
  const short = ((data as { short?: Short[] } | null)?.short ?? []) as Short[];
  await Promise.all(
    short.map((s) =>
      logStockProblem(admin, { shopId: opts.shopId, staffId: opts.staffId, source: opts.source, sourceId: opts.sourceId, productId: s.product_id, requested: Number(s.requested), available: Number(s.available), taken: Number(s.taken), reason: "short" }),
    ),
  );
  return short;
}

const NOT_IN_LIST = "An item here is no longer in this shop's list (deleted?) — refresh the screen and try again.";
const NOT_UPDATED = "Could not update stock — check the connection and try again.";

/** A move the database refused or didn't answer, other than an item not in the shop's list. */
async function moveFailed(admin: Admin, opts: Origin, error: { message?: string; details?: unknown }): Promise<StockMoveResult> {
  if (error.message === "insufficient_stock") return refusal(admin, opts, error.details);
  if (error.message === "invalid_stock_move") return { ok: false, refused: true, error: "A quantity must be a number greater than 0." };
  console.error("Could not move stock", opts.source, opts.sourceId, error);
  return { ok: false, refused: false, error: NOT_UPDATED };
}

/** Takes stock off (`take`) and puts it back (`give`) for the shop's own items, all lines together
 * in one database transaction (migration 0060's move_stock): every line moves or none does, and
 * stock never goes below zero. More than is in stock is refused — unless `allowShort` (a sale that
 * can't be refused: an offline bill already handed over, a served table, a stock count, a shop that
 * bills past its stock), when stock stops at zero and the shortfall is written down.
 *
 * Where move_stock isn't there yet it moves stock the old way, one item at a time — and never quietly
 * skips one: a line that can't move puts back the lines already moved and the whole move fails.
 *
 * `onShort` hears what an allowed short move left untaken (for a caller that records what really came off). */
export async function moveStock(
  admin: Admin,
  opts: { shopId: string; staffId: string | null; source: StockSource; sourceId?: string | null; take?: StockLine[]; give?: StockLine[]; allowShort: boolean; onShort?: (short: Short[]) => void },
): Promise<StockMoveResult> {
  const take = stockLines(opts.take ?? []);
  const give = stockLines(opts.give ?? []);
  if ("bad" in take || "bad" in give) {
    const bad = "bad" in take ? take.bad : (give as { bad: StockLine }).bad;
    await logStockProblem(admin, { shopId: opts.shopId, staffId: opts.staffId, source: opts.source, sourceId: opts.sourceId, productId: bad.productId ?? null, requested: Number(bad.quantity), reason: "invalid_quantity" });
    return { ok: false, refused: true, error: "A quantity must be a number greater than 0." };
  }
  if (!take.lines.length && !give.lines.length) return { ok: true };

  if (!functionMissing("move_stock")) {
    const { data, error } = await admin.rpc("move_stock", { p_shop_id: opts.shopId, p_take: take.lines, p_give: give.lines, p_allow_short: opts.allowShort });
    if (!noteFunctionResult("move_stock", error)) {
      if (!error) {
        const short = await noteShort(admin, opts, data);
        if (short.length) opts.onShort?.(short);
        return { ok: true };
      }
      if (error.message === "unknown_item") {
        // An item not in this shop's list (deleted meanwhile, or another shop's): nothing moved.
        const gone = unknownItem(error.details);
        const line = [...take.lines, ...give.lines].find((l) => l.product_id === gone);
        await logStockProblem(admin, { shopId: opts.shopId, staffId: opts.staffId, source: opts.source, sourceId: opts.sourceId, productId: gone, requested: line?.quantity ?? 0, reason: "unknown_item" });
        // A sale that is already made (allowShort) still moves the rest: the gone item has no stock to move.
        if (opts.allowShort && gone) {
          const without = (lines: { product_id: string; quantity: number }[]) => lines.filter((l) => l.product_id !== gone).map((l) => ({ productId: l.product_id, quantity: l.quantity }));
          return moveStock(admin, { ...opts, take: without(take.lines), give: without(give.lines) });
        }
        return { ok: false, refused: true, error: NOT_IN_LIST };
      }
      return moveFailed(admin, opts, error);
    }
  }
  return moveStockOneByOne(admin, { ...opts, take: take.lines, give: give.lines });
}

/** The old way, for a database without move_stock: one item at a time. Before 0060 the old
 * decrement_stock stops at zero by itself; after it (the API not reloaded yet) it refuses — then a
 * short sale takes what there is (written down) and a strict one is refused. Anything else going
 * wrong puts back what already moved and fails the whole move: it is never skipped quietly. */
async function moveStockOneByOne(
  admin: Admin,
  opts: { shopId: string; staffId: string | null; source: StockSource; sourceId?: string | null; take: { product_id: string; quantity: number }[]; give: { product_id: string; quantity: number }[]; allowShort: boolean; onShort?: (short: Short[]) => void },
): Promise<StockMoveResult> {
  const done: { product_id: string; quantity: number; sign: 1 | -1 }[] = [];
  const short: Short[] = [];
  const undo = async () => {
    for (const d of done.reverse()) {
      const { error } = await admin.rpc(d.sign < 0 ? "increment_stock" : "decrement_stock", { p_product_id: d.product_id, p_quantity: d.quantity });
      if (error) console.error("Could not undo a stock move", opts.source, opts.sourceId, d.product_id, error);
    }
  };
  const fail = async (result: StockMoveResult) => {
    await undo();
    return result;
  };
  for (const l of opts.take) {
    const { error } = await admin.rpc("decrement_stock", { p_product_id: l.product_id, p_quantity: l.quantity });
    if (!error) {
      done.push({ ...l, sign: -1 });
      continue;
    }
    if (error.message !== "insufficient_stock") {
      console.error("Could not take stock", opts.source, opts.sourceId, l.product_id, error);
      return fail({ ok: false, refused: false, error: "Could not update stock — check the connection and try again." });
    }
    if (!opts.allowShort) return fail(await refusal(admin, opts, error.details));
    const available = refusalDetail(error.details)?.available ?? 0;
    let taken = 0;
    if (available > 0) {
      const { error: shortError } = await admin.rpc("decrement_stock", { p_product_id: l.product_id, p_quantity: available });
      if (!shortError) {
        taken = available;
        done.push({ product_id: l.product_id, quantity: available, sign: -1 });
      }
    }
    await logStockProblem(admin, { shopId: opts.shopId, staffId: opts.staffId, source: opts.source, sourceId: opts.sourceId, productId: l.product_id, requested: l.quantity, available, taken, reason: "short" });
    short.push({ product_id: l.product_id, requested: l.quantity, available, taken });
  }
  for (const l of opts.give) {
    const { error } = await admin.rpc("increment_stock", { p_product_id: l.product_id, p_quantity: l.quantity });
    if (error) {
      console.error("Could not give stock back", opts.source, opts.sourceId, l.product_id, error);
      return fail({ ok: false, refused: false, error: "Could not update stock — check the connection and try again." });
    }
    done.push({ ...l, sign: 1 });
  }
  if (short.length) opts.onShort?.(short);
  return { ok: true };
}

export type BillStockLine = {
  billItemId: string;
  productId: string;
  /** What to take off now, in the item's stock unit (0 when its delivery challan took it all). */
  quantity: number;
  /** What the line's delivery challan already took off. */
  covered: number;
  /** The item's stock units per unit sold (1; 0.1 for a tablet of a strip of 10). */
  perUnit: number;
};

/** A new bill's counted lines: their stock taken off, and what each really took written on it
 * (bill_items.stock_taken), in one database transaction holding the bill (take_bill_stock, migration
 * 0060). A return or a void of the bill later puts back from that record — never more than was taken,
 * whatever the item's settings are by then. Every other line of the bill is written as having taken
 * nothing. A medicine's batches are drawn from in the same transaction, each one written down, and
 * so are the raw materials of the dishes sold by their recipe (`dishes`: their bill lines — written in
 * the kitchen's ledger, the lines marked; a raw material short stops at zero, as before) —
 * `recorded: true`: the caller draws neither again. Refused / short / unknown item as in moveStock.
 * Before the migration it moves stock the old way, with no record (such a bill keeps the old rule, and
 * the caller draws the batches and the raw materials). */
export async function takeBillStock(
  admin: Admin,
  opts: { shopId: string; staffId: string | null; billId: string; lines: BillStockLine[]; dishes?: string[]; allowShort: boolean },
): Promise<StockMoveResult & { recorded?: true }> {
  const origin: Origin = { shopId: opts.shopId, staffId: opts.staffId, source: "bill", sourceId: opts.billId };
  const lines = opts.lines.map((l) => ({ ...l, quantity: round3(Number(l.quantity)), covered: round3(Number(l.covered)), perUnit: Math.round(Number(l.perUnit) * 1e6) / 1e6 }));
  const bad = lines.find((l) => !Number.isFinite(l.quantity + l.covered + l.perUnit) || l.quantity < 0 || l.covered < 0 || !(l.perUnit > 0));
  if (bad) {
    await logStockProblem(admin, { ...origin, productId: bad.productId, requested: bad.quantity, reason: "invalid_quantity" });
    return { ok: false, refused: true, error: "A quantity must be a number greater than 0." };
  }
  const send = lines.filter((l) => l.quantity > 0 || l.covered > 0);

  if (!functionMissing("take_bill_stock")) {
    const { data, error } = await admin.rpc("take_bill_stock", {
      p_shop_id: opts.shopId,
      p_bill_id: opts.billId,
      p_lines: send.map((l) => ({ bill_item_id: l.billItemId, quantity: l.quantity, covered: l.covered, per_unit: l.perUnit })),
      p_allow_short: opts.allowShort,
      p_dishes: (opts.dishes ?? []).map((id) => ({ bill_item_id: id })),
    });
    if (!noteFunctionResult("take_bill_stock", error)) {
      if (!error) {
        await noteShort(admin, origin, data);
        return { ok: true, recorded: true };
      }
      if (error.message === "unknown_item") {
        const gone = unknownItem(error.details);
        await logStockProblem(admin, { ...origin, productId: gone, requested: send.find((l) => l.productId === gone)?.quantity ?? 0, reason: "unknown_item" });
        // A sale already made (allowShort): the gone item has no stock to take; its line took nothing.
        if (opts.allowShort && gone && send.some((l) => l.productId === gone)) return takeBillStock(admin, { ...opts, lines: opts.lines.filter((l) => l.productId !== gone) });
        return { ok: false, refused: true, error: NOT_IN_LIST };
      }
      return moveFailed(admin, origin, error);
    }
  }
  return moveStock(admin, { ...origin, take: lines.filter((l) => l.quantity > 0).map((l) => ({ productId: l.productId, quantity: l.quantity })), allowShort: opts.allowShort });
}

/** Was this bill's stock taken (its lines carry their record)? For a take whose answer was lost: the
 * database may have done it all. Null when that can't be told either. */
export async function billStockTaken(admin: Admin, billId: string): Promise<boolean | null> {
  const { count, error } = await admin.from("bill_items").select("id", { count: "exact", head: true }).eq("bill_id", billId).not("stock_taken", "is", null);
  if (error) return null;
  return (count ?? 0) > 0;
}

/** A line as an edit rewrites it: its new quantity and money figures. */
export type EditedLine = {
  billItemId: string;
  quantity: number;
  figures: { line_subtotal: number; cgst_amount: number; sgst_amount: number; igst_amount: number; line_gst: number; line_total: number };
};

/** A bill edit, whole, in one database transaction holding the bill (edit_bill_stock, migration
 * 0060): the stock each line moves (by its record — what it took, per unit sold; a bill from before the
 * migration by the old rule), the medicine batches, the recipes' raw materials, every line and the
 * bill's totals — all written, or nothing. "missing": the function isn't there (edit the old way).
 * "voided": the bill was voided meanwhile, nothing changed. */
export async function editBillStock(
  admin: Admin,
  opts: { shopId: string; staffId: string | null; billId: string; lines: EditedLine[]; bill: Record<string, number>; reason: string; allowShort: boolean },
): Promise<StockMoveResult | "missing" | "voided"> {
  if (functionMissing("edit_bill_stock")) return "missing";
  const origin: Origin = { shopId: opts.shopId, staffId: opts.staffId, source: "bill_edit", sourceId: opts.billId };
  const { data, error } = await admin.rpc("edit_bill_stock", {
    p_shop_id: opts.shopId,
    p_bill_id: opts.billId,
    p_lines: opts.lines.map((l) => ({ bill_item_id: l.billItemId, quantity: Number(l.quantity), ...l.figures })),
    p_bill: { ...opts.bill, edited_by: opts.staffId, edit_reason: opts.reason },
    p_allow_short: opts.allowShort,
  });
  if (noteFunctionResult("edit_bill_stock", error)) return "missing";
  if (error) {
    if (error.message === "unknown_item") {
      await logStockProblem(admin, { ...origin, productId: unknownItem(error.details), requested: 0, reason: "unknown_item" });
      return { ok: false, refused: true, error: NOT_IN_LIST };
    }
    if (error.message === "below_returned") {
      let returned = 0;
      try {
        returned = Number((JSON.parse(String(error.details)) as { returned?: number }).returned ?? 0);
      } catch {}
      return { ok: false, refused: true, error: `${returned} of this item were already returned — the quantity can't go below that.` };
    }
    return moveFailed(admin, origin, error);
  }
  if ((data as { result?: string } | null)?.result === "voided") return "voided";
  await noteShort(admin, origin, data);
  return { ok: true };
}

/** A return's lines go back on the shelf, once: through give_back_return (migration 0060), which
 * holds the bill's row, so a void at the same moment can't give them back too, and puts back what the
 * sale's record says each line took — the caller sends every line waiting, whatever the item's setting
 * is today. "voided": the bill was voided meanwhile and nothing moved (the void gave everything back).
 * Without the function the lines of items counted today (`countedNow`; all when not given) go back the
 * old way, and each line's stock_back is written where the column exists. */
export async function giveBackReturn(
  admin: Admin,
  opts: { shopId: string; staffId: string | null; returnId: string; lines: { returnItemId: string; productId: string; quantity: number }[]; stockBackReady: boolean; countedNow?: Set<string> },
): Promise<"ok" | "voided" | "failed"> {
  const waiting = opts.lines.filter((l) => Number(l.quantity) > 0);
  if (!waiting.length) return "ok";
  if (!functionMissing("give_back_return")) {
    const { data, error } = await admin.rpc("give_back_return", {
      p_shop_id: opts.shopId,
      p_return_id: opts.returnId,
      p_lines: waiting.map((l) => ({ return_item_id: l.returnItemId, product_id: l.productId, quantity: Number(l.quantity) })),
    });
    if (!noteFunctionResult("give_back_return", error)) {
      if (error) {
        console.error("Could not give a return's goods back", opts.returnId, error);
        return "failed";
      }
      return data === "voided" ? "voided" : "ok";
    }
  }
  const lines = opts.countedNow ? waiting.filter((l) => opts.countedNow!.has(l.productId)) : waiting;
  if (!lines.length) return "ok";
  const moved = await moveStock(admin, { shopId: opts.shopId, staffId: opts.staffId, source: "return", sourceId: opts.returnId, give: lines, allowShort: false });
  if (!moved.ok) return "failed";
  if (opts.stockBackReady) {
    // Marked as given back — or, where that can't be written, the goods are taken off again, so the
    // line still reads "not back yet" and a retry (or a void) can't give them back a second time.
    const marked = await Promise.all(lines.map((l) => admin.from("return_items").update({ stock_back: Number(l.quantity) }).eq("id", l.returnItemId)));
    if (marked.some((m) => m.error)) {
      const undone = await moveStock(admin, { shopId: opts.shopId, staffId: opts.staffId, source: "return", sourceId: opts.returnId, take: lines, allowShort: false });
      if (!undone.ok) {
        console.error("A return's goods went back but couldn't be marked or undone", opts.returnId, undone.error);
        await logAuditEvent({ admin, shopId: opts.shopId, staffId: opts.staffId, action: "return_stock_unclear", entityType: "return", entityId: opts.returnId, details: { lines: lines.map((l) => ({ returnItemId: l.returnItemId, productId: l.productId, quantity: l.quantity })) } });
      }
      return "failed";
    }
  }
  return "ok";
}

export type RecordReturnResult =
  | { kind: "saved"; returnId: string; duplicate: boolean }
  | { kind: "voided" }
  | { kind: "too_many"; billItemId: string; left: number }
  | { kind: "refused"; error: string }
  | { kind: "failed" }
  | { kind: "missing" };

/** A whole return in one database transaction holding the bill (record_return, migration 0060):
 * the credit note, its lines, the goods back on the shelf and to their batch, and the udhaar
 * adjustment — all or nothing, never more than is left to return, nothing against a voided bill, and
 * the same request (clientRef) saved once. "failed": no answer — it may have been saved; sending the
 * same clientRef again is safe. "missing": the function isn't there; the caller saves the old way. */
export async function recordReturn(
  admin: Admin,
  args: {
    shopId: string;
    billId: string;
    staffId: string;
    /** Required: the database refuses a return request without its id. */
    clientRef: string;
    header: Record<string, string | number | null>;
    lines: Record<string, string | number | null>[];
    creditNote: string | null;
  },
): Promise<RecordReturnResult> {
  if (functionMissing("record_return")) return { kind: "missing" };
  const { data, error } = await admin.rpc("record_return", {
    p_shop_id: args.shopId,
    p_bill_id: args.billId,
    p_staff_id: args.staffId,
    p_client_ref: args.clientRef,
    p_header: args.header,
    p_lines: args.lines,
    p_credit_note: args.creditNote,
  });
  if (noteFunctionResult("record_return", error)) return { kind: "missing" };
  if (error) {
    if (error.message === "unknown_item") return { kind: "refused", error: "An item on this bill is no longer in this shop's list, so its stock can't go back — nothing was returned." };
    if (error.message === "batch_mismatch") return { kind: "refused", error: "A returned medicine's batch is missing or doesn't match the item, so it can't go back to its batch — nothing was returned." };
    if (error.message === "invalid_stock_move") return { kind: "refused", error: "This return couldn't be saved — refresh the bill and try again." };
    if (error.message === "request_conflict") return { kind: "refused", error: "This return form was already used for another bill — reload the page and try again." };
    console.error("Could not record a return", args.billId, error);
    return { kind: "failed" };
  }
  const d = (data ?? {}) as { result?: string; return_id?: string; bill_item_id?: string; left?: number };
  if ((d.result === "ok" || d.result === "duplicate") && d.return_id) return { kind: "saved", returnId: d.return_id, duplicate: d.result === "duplicate" };
  if (d.result === "voided") return { kind: "voided" };
  if (d.result === "too_many" && d.bill_item_id) return { kind: "too_many", billItemId: d.bill_item_id, left: Number(d.left ?? 0) };
  return { kind: "failed" };
}

/** Voids a bill and gives its counted lines back, less what their returns already gave back — in one
 * transaction holding the bill's row (void_bill_stock, migration 0060), so a return at the same
 * moment can't make it twice. "missing": the function isn't there; the caller voids the old way. */
export async function voidBillStock(
  admin: Admin,
  opts: { shopId: string; staffId: string; billId: string; reason: string; lines: { billItemId: string; productId: string; quantity: number }[] },
): Promise<"ok" | "already_voided" | "has_credit_adjustment" | "missing" | "failed"> {
  if (functionMissing("void_bill_stock")) return "missing";
  const { data, error } = await admin.rpc("void_bill_stock", {
    p_shop_id: opts.shopId,
    p_bill_id: opts.billId,
    p_staff_id: opts.staffId,
    p_reason: opts.reason,
    p_lines: opts.lines.filter((l) => Number(l.quantity) > 0).map((l) => ({ bill_item_id: l.billItemId, product_id: l.productId, quantity: Number(l.quantity) })),
  });
  if (noteFunctionResult("void_bill_stock", error)) return "missing";
  if (error) {
    console.error("Could not void a bill", opts.billId, error);
    return "failed";
  }
  const result = (data as { result?: string } | null)?.result;
  if (result === "already_voided" || result === "has_credit_adjustment") return result;
  return "ok";
}

/** Has any return of this bill been adjusted against udhaar (refund_method 'credit_adjustment')?
 * Such a bill isn't voided: the adjustment would be counted twice. */
export async function billHasCreditAdjustment(admin: Admin, shopId: string, billId: string): Promise<boolean> {
  const { count } = await admin.from("returns").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("bill_id", billId).eq("refund_method", "credit_adjustment");
  return (count ?? 0) > 0;
}

/** What each line of a bill has already had given back by its returns (bill_item_id → quantity). A
 * line's stock_back where it is written; otherwise (returns from before migration 0060) all of it. */
export async function returnedBack(admin: Admin, billId: string): Promise<Map<string, number>> {
  const back = new Map<string, number>();
  const { data: returns } = await admin.from("returns").select("id").eq("bill_id", billId);
  const ids = (returns ?? []).map((r) => r.id);
  if (!ids.length) return back;
  // Before migration 0060 there is no stock_back column: every line went back.
  const withBack = await admin.from("return_items").select("bill_item_id, quantity, stock_back").in("return_id", ids);
  const rows = (withBack.error ? (await admin.from("return_items").select("bill_item_id, quantity").in("return_id", ids)).data : withBack.data) ?? [];
  for (const r of rows as { bill_item_id: string; quantity: number; stock_back?: number | null }[]) {
    back.set(r.bill_item_id, round3((back.get(r.bill_item_id) ?? 0) + Number(r.stock_back ?? r.quantity)));
  }
  return back;
}
