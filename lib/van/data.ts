import "server-only";
import type { createSupabaseAdminClient } from "../supabase/admin";
import type { SessionContext } from "../auth";
import { allRows } from "../supabase/allRows";
import { canRunVans, mayWorkTrip, moneyDue, type TripMoney, type TripStatus } from "./rules";
import { vanMoreReady } from "./server";
import { vanPhotoLinks } from "./photos";
import { wholesalePrices, wholesaleReady } from "../wholesaleData";
import { getCustomerBalances } from "../moneyBalances";
import { gapsReady } from "../gapsData";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

// The van tables come from migration 0066 and aren't in the generated types yet.
const db = (admin: Admin) => admin as unknown as { from: (t: string) => ReturnType<Admin["from"]> };

export type Van = { id: string; name: string; code: string; vehicleNumber: string | null; defaultStaffId: string | null; defaultRoute: string | null; isActive: boolean; maxDiscount: number | null };
export type Place = { id: string; name: string; code: string; kind: string; isDefault: boolean };
export type TripRow = {
  id: string;
  number: string;
  vehicleId: string;
  vehicleName: string;
  sourceId: string;
  salesmanId: string | null;
  salesmanName: string | null;
  route: string | null;
  status: TripStatus;
  openingCash: number;
  loadedAt: string | null;
  returnedAt: string | null;
  settledAt: string | null;
  createdAt: string;
  cashExpected: number | null;
  cashHanded: number | null;
  upiExpected: number | null;
  upiReceived: number | null;
  shortageValue: number | null;
  salesmanCharge: number;
  settleNote: string | null;
  /** The charge was taken off the salesman's salary (migration 0067). */
  salaryDeducted: boolean;
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** The shop's places: the main godown (the default — the counter sells from it) and its vans. */
export async function loadPlaces(admin: Admin, shopId: string): Promise<{ main: Place | null; vans: Van[]; places: Place[] }> {
  const { data } = await db(admin).from("godowns").select("*").eq("shop_id", shopId).order("is_default", { ascending: false }).order("name");
  const rows = (data ?? []) as Record<string, unknown>[];
  const places = rows.map((g) => ({ id: g.id as string, name: g.name as string, code: g.code as string, kind: g.kind as string, isDefault: !!g.is_default }));
  return {
    main: places.find((p) => p.isDefault) ?? null,
    places,
    vans: rows
      .filter((g) => g.kind === "vehicle")
      .map((g) => ({
        id: g.id as string,
        name: g.name as string,
        code: g.code as string,
        vehicleNumber: (g.vehicle_number as string) ?? null,
        defaultStaffId: (g.default_staff_id as string) ?? null,
        defaultRoute: (g.default_route as string) ?? null,
        isActive: g.is_active !== false,
        maxDiscount: g.van_max_discount === null || g.van_max_discount === undefined ? null : Number(g.van_max_discount),
      })),
  };
}

export async function loadStaff(admin: Admin, shopId: string): Promise<{ id: string; name: string; role: string }[]> {
  const { data } = await admin.from("staff").select("id, name, role").eq("shop_id", shopId).order("name");
  return (data ?? []).map((s) => ({ id: s.id, name: s.name, role: s.role }));
}

function toTrip(t: Record<string, unknown>, vanName: Map<string, string>, staffName: Map<string, string>): TripRow {
  return {
    id: t.id as string,
    number: t.trip_number as string,
    vehicleId: t.vehicle_id as string,
    vehicleName: vanName.get(t.vehicle_id as string) ?? "Van",
    sourceId: t.source_godown_id as string,
    salesmanId: (t.salesman_id as string) ?? null,
    salesmanName: t.salesman_id ? staffName.get(t.salesman_id as string) ?? null : null,
    route: (t.route as string) ?? null,
    status: t.status as TripStatus,
    openingCash: Number(t.opening_cash ?? 0),
    loadedAt: (t.loaded_at as string) ?? null,
    returnedAt: (t.returned_at as string) ?? null,
    settledAt: (t.settled_at as string) ?? null,
    createdAt: t.created_at as string,
    cashExpected: num(t.cash_expected),
    cashHanded: num(t.cash_handed),
    upiExpected: num(t.upi_expected),
    upiReceived: num(t.upi_received),
    shortageValue: num(t.shortage_value),
    salesmanCharge: Number(t.salesman_charge ?? 0),
    settleNote: (t.settle_note as string) ?? null,
    salaryDeducted: !!t.salary_deduction_id,
  };
}

/** Trips started in a date range (India dates, inclusive), newest first; a salesman sees his own. */
export async function loadTrips(admin: Admin, session: SessionContext, opts: { from: string; to: string; mine?: boolean }): Promise<TripRow[]> {
  const [{ vans }, staff] = await Promise.all([loadPlaces(admin, session.shopId), loadStaff(admin, session.shopId)]);
  let q = db(admin)
    .from("van_trips")
    .select("*")
    .eq("shop_id", session.shopId)
    .gte("created_at", new Date(`${opts.from}T00:00:00+05:30`).toISOString())
    .lte("created_at", new Date(`${opts.to}T23:59:59.999+05:30`).toISOString())
    .order("created_at", { ascending: false })
    .limit(500);
  if (opts.mine) q = q.eq("salesman_id", session.userId);
  const { data } = await q;
  return ((data ?? []) as Record<string, unknown>[]).map((t) => toTrip(t, new Map(vans.map((v) => [v.id, v.name])), new Map(staff.map((s) => [s.id, s.name]))));
}

/** Trips still open (any date): what the vans are doing now. */
export async function loadOpenTrips(admin: Admin, session: SessionContext): Promise<TripRow[]> {
  const [{ vans }, staff] = await Promise.all([loadPlaces(admin, session.shopId), loadStaff(admin, session.shopId)]);
  const { data } = await db(admin).from("van_trips").select("*").eq("shop_id", session.shopId).in("status", ["draft", "loaded", "returned"]).order("created_at", { ascending: false });
  return ((data ?? []) as Record<string, unknown>[]).map((t) => toTrip(t, new Map(vans.map((v) => [v.id, v.name])), new Map(staff.map((s) => [s.id, s.name]))));
}

export type TripItem = { productId: string; name: string; unit: string; price: number; loaded: number; sold: number; returned: number; onVan: number };
export type TripBill = { id: string; number: string; customer: string | null; total: number; paid: number; credit: number; status: string; createdAt: string };
export type TripExpense = { id: string; kind: string; amount: number; note: string | null; createdAt: string; photo: string | null };
export type TripReturn = { id: string; number: string; customer: string | null; total: number; refundMethod: string; createdAt: string };
export type TripCount = { productId: string; name: string; loaded: number; sold: number; returned: number; expected: number; counted: number; damaged: number; shortage: number; excess: number };

/** One trip in full: its items (loaded, sold, still on the van), bills, money and expenses, and the
 * settlement count once settled. Null when it isn't this shop's. */
export async function loadTrip(admin: Admin, session: SessionContext, tripId: string) {
  const { data: raw } = await db(admin).from("van_trips").select("*").eq("id", tripId).eq("shop_id", session.shopId).maybeSingle();
  if (!raw) return null;
  const [{ vans, places }, staff] = await Promise.all([loadPlaces(admin, session.shopId), loadStaff(admin, session.shopId)]);
  const trip = toTrip(raw as Record<string, unknown>, new Map(vans.map((v) => [v.id, v.name])), new Map(staff.map((s) => [s.id, s.name])));

  const more = await vanMoreReady(admin);
  const [{ data: ledger }, { data: onVanRows }, { data: billRows }, { data: expenseRows }, { data: countRows }, { data: returnRows }] = await Promise.all([
    allRows((from, to) =>
      db(admin)
        .from("inventory_ledger")
        .select("id, product_id, product_name, quantity, kind, ref_type, ref_id, note")
        .eq("shop_id", session.shopId)
        .eq("godown_id", trip.vehicleId)
        .in("kind", ["van_load", "van_topup", "van_sale", "van_sale_back", "van_return"])
        .or(`and(ref_type.eq.van_trip,ref_id.eq.${trip.id}),and(ref_type.eq.bill,note.eq.${trip.number}),and(ref_type.eq.return,note.eq.${trip.number})`)
        .order("id")
        .range(from, to),
    ),
    db(admin).from("godown_stock").select("product_id, saleable").eq("godown_id", trip.vehicleId).gt("saleable", 0),
    db(admin).from("bills").select("id, invoice_number, total, paid_amount, credit_amount, status, created_at, customers ( name )").eq("shop_id", session.shopId).eq("van_trip_id", trip.id).order("created_at"),
    db(admin).from("van_expenses").select(more ? "id, kind, amount, note, created_at, photo_path" : "id, kind, amount, note, created_at").eq("trip_id", trip.id).order("created_at"),
    db(admin).from("van_trip_lines").select("*").eq("trip_id", trip.id),
    more
      ? db(admin).from("returns").select("id, return_number, total, refund_method, created_at, customers ( name )").eq("shop_id", session.shopId).eq("van_trip_id", trip.id).order("created_at")
      : Promise.resolve({ data: [] }),
  ]);

  const items = new Map<string, TripItem>();
  const ensure = (id: string, name: string) => {
    let i = items.get(id);
    if (!i) {
      i = { productId: id, name, unit: "", price: 0, loaded: 0, sold: 0, returned: 0, onVan: 0 };
      items.set(id, i);
    }
    return i;
  };
  for (const l of (ledger ?? []) as { product_id: string; product_name: string; quantity: number; kind: string }[]) {
    const i = ensure(l.product_id, l.product_name);
    if (l.kind === "van_load" || l.kind === "van_topup") i.loaded += Number(l.quantity);
    else if (l.kind === "van_return") i.returned += Number(l.quantity);
    else i.sold -= Number(l.quantity);
  }
  if (trip.status === "loaded" || trip.status === "returned" || trip.status === "draft") {
    for (const r of (onVanRows ?? []) as { product_id: string; saleable: number }[]) ensure(r.product_id, "").onVan = Number(r.saleable);
  }
  const ids = [...items.keys()];
  if (ids.length) {
    const { data: prods } = await admin.from("products").select("id, name, unit, price").eq("shop_id", session.shopId).in("id", ids);
    for (const p of prods ?? []) {
      const i = items.get(p.id)!;
      i.name = i.name || p.name;
      i.unit = p.unit;
      i.price = Number(p.price);
    }
  }

  const bills: TripBill[] = ((billRows ?? []) as Record<string, unknown>[]).map((b) => ({
    id: b.id as string,
    number: b.invoice_number as string,
    customer: ((b.customers as { name?: string } | null)?.name as string) ?? null,
    total: Number(b.total),
    paid: Number(b.paid_amount),
    credit: Number(b.credit_amount),
    status: b.status as string,
    createdAt: b.created_at as string,
  }));
  const expenseList = (expenseRows ?? []) as Record<string, unknown>[];
  const photoOf = await vanPhotoLinks(admin, expenseList.map((e) => e.photo_path as string | null));
  const expenses: TripExpense[] = expenseList.map((e) => ({ id: e.id as string, kind: e.kind as string, amount: Number(e.amount), note: (e.note as string) ?? null, createdAt: e.created_at as string, photo: photoOf.get(e.photo_path as string) ?? null }));
  const returns: TripReturn[] = ((returnRows ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    number: r.return_number as string,
    customer: ((r.customers as { name?: string } | null)?.name as string) ?? null,
    total: Number(r.total),
    refundMethod: r.refund_method as string,
    createdAt: r.created_at as string,
  }));
  const counts: TripCount[] = ((countRows ?? []) as Record<string, unknown>[]).map((c) => ({
    productId: c.product_id as string,
    name: c.product_name as string,
    loaded: Number(c.loaded),
    sold: Number(c.sold),
    returned: Number(c.returned ?? 0),
    expected: Number(c.expected),
    counted: Number(c.counted),
    damaged: Number(c.damaged),
    shortage: Number(c.shortage),
    excess: Number(c.excess),
  }));

  return {
    trip,
    vehicle: vans.find((v) => v.id === trip.vehicleId) ?? null,
    source: places.find((p) => p.id === trip.sourceId) ?? null,
    items: [...items.values()].sort((a, b) => a.name.localeCompare(b.name)),
    bills,
    expenses,
    returns,
    counts,
    money: await tripMoney(admin, session.shopId, trip, bills, expenses, returns),
  };
}

/** The money side of a trip. Bills: by their payment rows (migration 0061) where they have them, else
 * by their single mode. Collections: old dues the trip's salesman took while the trip was out. */
export async function tripMoney(admin: Admin, shopId: string, trip: TripRow, bills: TripBill[], expenses: TripExpense[], returns: TripReturn[] = []): Promise<TripMoney & ReturnType<typeof moneyDue> & { collections: number }> {
  const active = bills.filter((b) => b.status === "active");
  const ids = active.map((b) => b.id);
  const refunds = (method: string) => returns.filter((r) => r.refundMethod === method).reduce((s, r) => s + r.total, 0);
  const m: TripMoney = {
    openingCash: trip.openingCash,
    cashBills: 0,
    upiBills: 0,
    otherBills: 0,
    creditBills: 0,
    cashCollections: 0,
    upiCollections: 0,
    expenses: expenses.reduce((s, e) => s + e.amount, 0),
    cashRefunds: refunds("cash"),
    upiRefunds: refunds("upi"),
  };
  if (ids.length) {
    const [{ data: rows }, { data: heads }] = await Promise.all([
      db(admin).from("bill_payments").select("bill_id, payment_method, amount").in("bill_id", ids),
      admin.from("bills").select("id, payment_method, paid_amount, credit_amount").in("id", ids),
    ]);
    const withRows = new Set(((rows ?? []) as { bill_id: string }[]).map((r) => r.bill_id));
    for (const r of (rows ?? []) as { payment_method: string; amount: number }[]) {
      if (r.payment_method === "cash") m.cashBills += Number(r.amount);
      else if (r.payment_method === "upi") m.upiBills += Number(r.amount);
      else m.otherBills += Number(r.amount);
    }
    for (const h of heads ?? []) {
      m.creditBills += Number(h.credit_amount);
      if (withRows.has(h.id)) continue;
      const paid = Number(h.paid_amount);
      if (h.payment_method === "cash") m.cashBills += paid;
      else if (h.payment_method === "upi") m.upiBills += paid;
      else m.otherBills += paid;
    }
  }
  if (trip.salesmanId && trip.loadedAt) {
    const { data: pays } = await admin
      .from("payments")
      .select("amount, payment_method")
      .eq("shop_id", shopId)
      .eq("staff_id", trip.salesmanId)
      .gte("created_at", trip.loadedAt)
      .lte("created_at", trip.returnedAt ?? trip.settledAt ?? new Date().toISOString());
    for (const p of pays ?? []) {
      if (p.payment_method === "cash") m.cashCollections += Number(p.amount);
      else if (p.payment_method === "upi") m.upiCollections += Number(p.amount);
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  (Object.keys(m) as (keyof TripMoney)[]).forEach((k) => (m[k] = round(m[k])));
  return { ...m, ...moneyDue(m), collections: round(m.cashCollections + m.upiCollections) };
}

/** What New Bill offers when it bills from a van: only what is on the van, at the van's quantities.
 * Null when the trip isn't on the route or this person may not bill from it. */
export type KeptNumbers = { prefix: string; from: number; to: number; next: number };

/** The trip's kept bill numbers (migration 0067), keeping more when few are left. Null off the route. */
export async function tripNumbers(admin: Admin, shopId: string, tripId: string): Promise<KeptNumbers | null> {
  if (!(await vanMoreReady(admin))) return null;
  const { data, error } = await (admin.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)("van_trip_numbers", { p_shop: shopId, p_trip: tripId });
  if (error || !data) return null;
  const n = data as KeptNumbers;
  return { prefix: String(n.prefix), from: Number(n.from), to: Number(n.to), next: Number(n.next) };
}

export async function vanBillingStock(admin: Admin, session: SessionContext, tripId: string): Promise<{ tripId: string; number: string; vehicle: string; stock: Map<string, number>; numbers: KeptNumbers | null; maxDiscount: number | null } | null> {
  const { data } = await db(admin).from("van_trips").select("id, trip_number, status, salesman_id, vehicle_id").eq("id", tripId).eq("shop_id", session.shopId).maybeSingle();
  const t = data as { id: string; trip_number: string; status: string; salesman_id: string | null; vehicle_id: string } | null;
  if (!t || t.status !== "loaded" || !mayWorkTrip(session.role, session.userId, t.salesman_id)) return null;
  const more = await vanMoreReady(admin);
  const [{ data: van }, { data: rows }, numbers] = await Promise.all([
    db(admin).from("godowns").select(more ? "name, van_max_discount" : "name").eq("id", t.vehicle_id).maybeSingle(),
    db(admin).from("godown_stock").select("product_id, saleable").eq("godown_id", t.vehicle_id).gt("saleable", 0),
    tripNumbers(admin, session.shopId, t.id),
  ]);
  const v = van as { name?: string; van_max_discount?: number | null } | null;
  return {
    tripId: t.id,
    number: t.trip_number,
    vehicle: v?.name ?? "Van",
    stock: new Map(((rows ?? []) as { product_id: string; saleable: number }[]).map((r) => [r.product_id, Number(r.saleable)])),
    numbers,
    maxDiscount: v?.van_max_discount == null ? null : Number(v.van_max_discount),
  };
}

/** What the salesman's phone keeps to bill from the van with no internet (Offline billing's van mode):
 * the van's items at their rates, the route's parties with their rate level and udhaar room, the shop
 * pins, and the trip's kept bill numbers. Only for a trip on the route. */
export type VanOfflinePack = {
  v: 1;
  shopId: string;
  /** The shop's own details, so Offline billing works on a phone that never opened the counter's New Bill. */
  shop: { name: string; stateCode: string; priceIncludesGst: boolean; staffId: string; staffName: string };
  tripId: string;
  tripNumber: string;
  vehicle: string;
  manager: boolean;
  maxDiscount: number | null;
  numbers: KeptNumbers | null;
  items: { id: string; name: string; unit: string; price: number; bulkMin: number | null; bulkPrice: number | null; wholesale: number | null; gst: number; hsn: string | null; onVan: number }[];
  parties: { id: string; name: string; phone: string | null; wholesale: boolean; limit: number | null; owed: number; lat: number | null; lng: number | null }[];
  savedAt: string;
};

export async function vanOfflinePack(admin: Admin, session: SessionContext, trip: TripRow, vehicle: Van | null, items: TripItem[], shops: RouteShop[]): Promise<VanOfflinePack | null> {
  if (trip.status !== "loaded" || !(await vanMoreReady(admin))) return null;
  const onVan = items.filter((i) => i.onVan > 0);
  const ids = onVan.map((i) => i.productId);
  const partyIds = shops.map((s) => s.id);
  const [{ data: prods }, wholesale, numbers, { data: terms }, { data: limits }, owed] = await Promise.all([
    ids.length ? admin.from("products").select("id, name, unit, price, offer_price, bulk_min_qty, bulk_price, gst_percent, hsn_code").eq("shop_id", session.shopId).in("id", ids) : Promise.resolve({ data: [] }),
    wholesalePrices(admin, ids),
    tripNumbers(admin, session.shopId, trip.id),
    partyIds.length && (await wholesaleReady(admin)) ? admin.from("customers").select("id, price_level").eq("shop_id", session.shopId).in("id", partyIds) : Promise.resolve({ data: [] }),
    partyIds.length && (await gapsReady(admin)) ? admin.from("customers").select("id, credit_limit").eq("shop_id", session.shopId).in("id", partyIds) : Promise.resolve({ data: [] }),
    partyIds.length ? getCustomerBalances(admin, session.shopId, partyIds).catch(() => new Map<string, number>()) : Promise.resolve(new Map<string, number>()),
  ]);
  const levelOf = new Map(((terms ?? []) as { id: string; price_level: string | null }[]).map((c) => [c.id, c.price_level]));
  const limitOf = new Map(((limits ?? []) as { id: string; credit_limit: number | null }[]).map((c) => [c.id, c.credit_limit]));
  const onVanOf = new Map(onVan.map((i) => [i.productId, i.onVan]));
  type Prod = { id: string; name: string; unit: string; price: number; offer_price: number | null; bulk_min_qty: number | null; bulk_price: number | null; gst_percent: number; hsn_code: string | null };
  return {
    v: 1,
    shopId: session.shopId,
    shop: { name: session.shopName, stateCode: session.shopStateCode ?? "", priceIncludesGst: session.priceIncludesGst, staffId: session.userId, staffName: session.staffName },
    tripId: trip.id,
    tripNumber: trip.number,
    vehicle: vehicle?.name ?? trip.vehicleName,
    manager: canRunVans(session.role),
    maxDiscount: vehicle?.maxDiscount ?? null,
    numbers,
    items: ((prods ?? []) as Prod[]).map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      price: p.offer_price != null && Number(p.offer_price) > 0 ? Number(p.offer_price) : Number(p.price),
      bulkMin: p.bulk_min_qty ? Number(p.bulk_min_qty) : null,
      bulkPrice: p.bulk_price ? Number(p.bulk_price) : null,
      wholesale: wholesale.get(p.id) ?? null,
      gst: session.gstScheme === "composition" ? 0 : Number(p.gst_percent),
      hsn: p.hsn_code,
      onVan: onVanOf.get(p.id) ?? 0,
    })),
    parties: shops.map((s) => {
      const limit = limitOf.get(s.id);
      return { id: s.id, name: s.name, phone: s.phone, wholesale: levelOf.get(s.id) === "wholesale", limit: limit == null ? null : Number(limit), owed: Math.round((owed.get(s.id) ?? 0) * 100) / 100, lat: s.lat, lng: s.lng };
    }),
    savedAt: new Date().toISOString(),
  };
}

/** Stock in every place: the main godown, each van, and damaged stock. Items with any stock only. */
export async function loadStockByPlace(admin: Admin, shopId: string) {
  const { places } = await loadPlaces(admin, shopId);
  const [{ data: products }, { data: rows }] = await Promise.all([
    allRows((from, to) => admin.from("products").select("id, name, unit, stock_quantity, track_inventory").eq("shop_id", shopId).eq("track_inventory", true).order("name").order("id").range(from, to)),
    allRows((from, to) => db(admin).from("godown_stock").select("godown_id, product_id, saleable, damaged").eq("shop_id", shopId).order("product_id").range(from, to)),
  ]);
  const main = places.find((p) => p.isDefault);
  const at = new Map<string, Map<string, number>>();
  const damaged = new Map<string, number>();
  const others = new Map<string, number>();
  for (const r of (rows ?? []) as { godown_id: string; product_id: string; saleable: number; damaged: number }[]) {
    if (!at.has(r.product_id)) at.set(r.product_id, new Map());
    if (r.godown_id !== main?.id) {
      at.get(r.product_id)!.set(r.godown_id, Number(r.saleable));
      others.set(r.product_id, (others.get(r.product_id) ?? 0) + Number(r.saleable));
    }
    damaged.set(r.product_id, (damaged.get(r.product_id) ?? 0) + Number(r.damaged));
  }
  return {
    places,
    rows: (products ?? [])
      .map((p) => {
        const byPlace = at.get(p.id) ?? new Map<string, number>();
        if (main) byPlace.set(main.id, Number(p.stock_quantity) - (others.get(p.id) ?? 0));
        return { id: p.id, name: p.name, unit: p.unit, saleable: Number(p.stock_quantity), damaged: damaged.get(p.id) ?? 0, byPlace };
      })
      .filter((r) => r.saleable !== 0 || r.damaged !== 0),
  };
}

export type TripSummary = TripRow & { bills: number; sold: number; cash: number; upi: number; credit: number; collections: number; expenses: number; damaged: number };

/** The report's figures for many trips at once: a few reads, not a few per trip. */
export async function tripSummaries(admin: Admin, shopId: string, trips: TripRow[]): Promise<TripSummary[]> {
  const ids = trips.map((x) => x.id);
  if (!ids.length) return [];
  const [{ data: bills }, { data: expenses }, { data: lines }] = await Promise.all([
    db(admin).from("bills").select("id, van_trip_id, total, paid_amount, credit_amount, payment_method, status").eq("shop_id", shopId).in("van_trip_id", ids),
    db(admin).from("van_expenses").select("trip_id, amount").in("trip_id", ids),
    db(admin).from("van_trip_lines").select("trip_id, damaged").in("trip_id", ids),
  ]);
  const active = ((bills ?? []) as { id: string; van_trip_id: string; total: number; paid_amount: number; credit_amount: number; payment_method: string; status: string }[]).filter((b) => b.status === "active");
  const { data: payRows } = active.length ? await db(admin).from("bill_payments").select("bill_id, payment_method, amount").in("bill_id", active.map((b) => b.id)) : { data: [] };
  const rowsOf = new Map<string, { payment_method: string; amount: number }[]>();
  for (const r of (payRows ?? []) as { bill_id: string; payment_method: string; amount: number }[]) rowsOf.set(r.bill_id, [...(rowsOf.get(r.bill_id) ?? []), r]);

  const salesmen = [...new Set(trips.map((x) => x.salesmanId).filter((x): x is string => !!x))];
  const earliest = trips.map((x) => x.loadedAt).filter((x): x is string => !!x).sort()[0];
  const { data: pays } = salesmen.length && earliest ? await admin.from("payments").select("staff_id, amount, created_at").eq("shop_id", shopId).in("staff_id", salesmen).gte("created_at", earliest) : { data: [] };

  const round = (n: number) => Math.round(n * 100) / 100;
  return trips.map((trip) => {
    const own = active.filter((b) => b.van_trip_id === trip.id);
    let cash = 0, upi = 0;
    for (const b of own) {
      const rows = rowsOf.get(b.id);
      if (rows?.length) {
        for (const r of rows) {
          if (r.payment_method === "cash") cash += Number(r.amount);
          else if (r.payment_method === "upi") upi += Number(r.amount);
        }
      }
      else if (b.payment_method === "cash") cash += Number(b.paid_amount);
      else if (b.payment_method === "upi") upi += Number(b.paid_amount);
    }
    const end = trip.returnedAt ?? trip.settledAt ?? new Date().toISOString();
    const collections = trip.salesmanId && trip.loadedAt ? (pays ?? []).filter((p) => p.staff_id === trip.salesmanId && p.created_at >= trip.loadedAt! && p.created_at <= end).reduce((s, p) => s + Number(p.amount), 0) : 0;
    return {
      ...trip,
      bills: own.length,
      sold: round(own.reduce((s, b) => s + Number(b.total), 0)),
      cash: round(cash),
      upi: round(upi),
      credit: round(own.reduce((s, b) => s + Number(b.credit_amount), 0)),
      collections: round(collections),
      expenses: round(((expenses ?? []) as { trip_id: string; amount: number }[]).filter((e) => e.trip_id === trip.id).reduce((s, e) => s + Number(e.amount), 0)),
      damaged: ((lines ?? []) as { trip_id: string; damaged: number }[]).filter((l) => l.trip_id === trip.id).reduce((s, l) => s + Number(l.damaged), 0),
    };
  });
}

// ─── Route tracking ────────────────────────────────────────────────────────────

export type RouteShop = { id: string; name: string; phone: string | null; beat: string | null; lat: number | null; lng: number | null; radius: number; pinVerified: boolean };
export type Visit = { id: string; tripId: string; customerId: string | null; customer: string | null; checkInAt: string; checkOutAt: string | null; outcome: string; note: string | null; billId: string | null; distance: number | null; verified: boolean | null; lat: number | null; lng: number | null; photoPath: string | null };
export type PingRow = { lat: number; lng: number; accuracy: number | null; at: string; source: string; tripId: string };

/** Shop pins for some or all parties. */
export async function loadPins(admin: Admin, shopId: string, customerIds?: string[]): Promise<Map<string, { lat: number; lng: number; radius: number; verified: boolean }>> {
  let q = db(admin).from("van_shop_locations").select("customer_id, latitude, longitude, radius_m, verified").eq("shop_id", shopId);
  if (customerIds) {
    if (!customerIds.length) return new Map();
    q = q.in("customer_id", customerIds);
  }
  const { data } = await q;
  return new Map(((data ?? []) as { customer_id: string; latitude: number; longitude: number; radius_m: number; verified: boolean }[]).map((p) => [p.customer_id, { lat: Number(p.latitude), lng: Number(p.longitude), radius: p.radius_m, verified: p.verified }]));
}

/** The shops of a trip's route: the parties on its beat, plus any it billed or visited off the beat. */
export async function loadRouteShops(admin: Admin, shopId: string, route: string | null, extraIds: string[]): Promise<RouteShop[]> {
  const sel = "id, name, phone, beat";
  const [{ data: onBeat }, { data: extra }] = await Promise.all([
    route ? admin.from("customers").select(sel).eq("shop_id", shopId).ilike("beat" as never, route.replace(/[\\%_]/g, (c) => `\\${c}`)).order("name").limit(500) : Promise.resolve({ data: [] }),
    extraIds.length ? admin.from("customers").select(sel).eq("shop_id", shopId).in("id", extraIds) : Promise.resolve({ data: [] }),
  ]);
  const rows = new Map<string, { id: string; name: string; phone: string | null; beat: string | null }>();
  for (const c of [...((onBeat ?? []) as never[]), ...((extra ?? []) as never[])] as { id: string; name: string; phone: string | null; beat: string | null }[]) rows.set(c.id, c);
  const pins = await loadPins(admin, shopId, [...rows.keys()]);
  return [...rows.values()].map((c) => {
    const p = pins.get(c.id);
    return { id: c.id, name: c.name, phone: c.phone, beat: c.beat, lat: p?.lat ?? null, lng: p?.lng ?? null, radius: p?.radius ?? 150, pinVerified: p?.verified ?? false };
  });
}

function toVisit(v: Record<string, unknown>, names: Map<string, string>): Visit {
  return {
    id: v.id as string,
    tripId: v.trip_id as string,
    customerId: (v.customer_id as string) ?? null,
    customer: v.customer_id ? names.get(v.customer_id as string) ?? null : null,
    checkInAt: v.check_in_at as string,
    checkOutAt: (v.check_out_at as string) ?? null,
    outcome: v.outcome as string,
    note: (v.note as string) ?? null,
    billId: (v.bill_id as string) ?? null,
    distance: v.distance_m === null || v.distance_m === undefined ? null : Number(v.distance_m),
    verified: (v.verified as boolean | null) ?? null,
    lat: v.latitude === null || v.latitude === undefined ? null : Number(v.latitude),
    lng: v.longitude === null || v.longitude === undefined ? null : Number(v.longitude),
    photoPath: (v.photo_path as string) ?? null,
  };
}

/** Visits and location readings of some trips, in time order. */
export async function loadTracks(admin: Admin, shopId: string, tripIds: string[]): Promise<{ visits: Visit[]; pings: PingRow[] }> {
  if (!tripIds.length) return { visits: [], pings: [] };
  const [{ data: v }, { data: p }] = await Promise.all([
    db(admin).from("van_visits").select("*").eq("shop_id", shopId).in("trip_id", tripIds).order("check_in_at"),
    allRows((from, to) => db(admin).from("van_pings").select("trip_id, latitude, longitude, accuracy_m, at, source").eq("shop_id", shopId).in("trip_id", tripIds).order("at").order("id").range(from, to)),
  ]);
  const visits = (v ?? []) as Record<string, unknown>[];
  const ids = [...new Set(visits.map((x) => x.customer_id as string).filter(Boolean))];
  const { data: names } = ids.length ? await admin.from("customers").select("id, name").in("id", ids) : { data: [] };
  const nameOf = new Map((names ?? []).map((c) => [c.id, c.name]));
  return {
    visits: visits.map((x) => toVisit(x, nameOf)),
    pings: ((p ?? []) as Record<string, unknown>[]).map((x) => ({ lat: Number(x.latitude), lng: Number(x.longitude), accuracy: x.accuracy_m === null ? null : Number(x.accuracy_m), at: x.at as string, source: x.source as string, tripId: x.trip_id as string })),
  };
}

/** Where each open trip's van was last seen. */
export async function loadLivePositions(admin: Admin, session: SessionContext): Promise<{ trip: TripRow; at: string | null; lat: number | null; lng: number | null }[]> {
  const open = (await loadOpenTrips(admin, session)).filter((x) => x.status === "loaded");
  return Promise.all(
    open.map(async (trip) => {
      const { data } = await db(admin).from("van_pings").select("latitude, longitude, at").eq("trip_id", trip.id).order("at", { ascending: false }).limit(1).maybeSingle();
      const p = data as { latitude: number; longitude: number; at: string } | null;
      return { trip, at: p?.at ?? null, lat: p ? Number(p.latitude) : null, lng: p ? Number(p.longitude) : null };
    }),
  );
}

/** Visits in a date range across all trips, for the "no order" analysis and missed-shop counts. */
export async function loadVisitsBetween(admin: Admin, shopId: string, from: string, to: string): Promise<Visit[]> {
  const { data } = await db(admin)
    .from("van_visits")
    .select("*")
    .eq("shop_id", shopId)
    .gte("check_in_at", new Date(`${from}T00:00:00+05:30`).toISOString())
    .lte("check_in_at", new Date(`${to}T23:59:59.999+05:30`).toISOString())
    .order("check_in_at")
    .limit(5000);
  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = [...new Set(rows.map((x) => x.customer_id as string).filter(Boolean))];
  const { data: names } = ids.length ? await admin.from("customers").select("id, name").in("id", ids) : { data: [] };
  const nameOf = new Map((names ?? []).map((c) => [c.id, c.name]));
  return rows.map((x) => toVisit(x, nameOf));
}
