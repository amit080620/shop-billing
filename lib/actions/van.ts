"use server";

import { requireSession, type SessionContext } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { isModuleEnabled } from "../modules";
import { moduleLockMessage } from "../plans";
import { logAuditEvent } from "../audit";
import { vanSchemaReady } from "../van/server";
import { canRunVans, countResult, EXPENSE_KINDS, mayWorkTrip, vanError, type ExpenseKind } from "../van/rules";
import { loadTrip } from "../van/data";
import { visitCheck, VISIT_OUTCOMES } from "../van/geo";
import { findOrCreateCustomerByPhone } from "./customers";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type Result = { error?: string; id?: string };

// The van tables come from migration 0066 and aren't in the generated types yet.
const db = (admin: Admin) => admin as unknown as { from: (t: string) => ReturnType<Admin["from"]>; rpc: (fn: string, args: Record<string, unknown>) => ReturnType<Admin["rpc"]> };

/** Saves answer at once and the screen refreshes itself, as elsewhere. Every action checks: a wholesale
 * shop, the plan's module, migration 0066 run, and (where it says) the owner or a manager. */
async function open(manage: boolean): Promise<{ session: SessionContext; admin: Admin } | { error: string }> {
  const session = await requireSession();
  if (session.businessType !== "wholesale") return { error: "Van sales is part of the Wholesale / Distributor business type." };
  if (!isModuleEnabled(session.enabledModules, "van_sales")) return { error: moduleLockMessage("van_sales") };
  const admin = createSupabaseAdminClient();
  if (!(await vanSchemaReady(admin))) return { error: "Van sales is waiting for a database update on the server." };
  if (manage && !canRunVans(session.role)) return { error: "Only the owner or a manager can do this." };
  return { session, admin };
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const failed = (e: { message?: string; details?: string | null } | null) => (e ? vanError(e.message, e.details ?? null) : null);
type Line = { productId: string; quantity: number };
const linesJson = (lines: Line[]) =>
  lines.filter((l) => /^[0-9a-f-]{36}$/i.test(l.productId) && Number(l.quantity) > 0).map((l) => ({ product_id: l.productId, quantity: Math.round(Number(l.quantity) * 1000) / 1000 }));

/** The main godown (the default, where the counter sells and purchases land), made the first time a
 * van is added, so stock has somewhere to load from. */
async function ensureMainGodown(admin: Admin, shopId: string): Promise<void> {
  const { data } = await db(admin).from("godowns").select("id").eq("shop_id", shopId).eq("is_default", true).maybeSingle();
  if (data) return;
  await db(admin).from("godowns").insert({ shop_id: shopId, name: "Main Godown", code: "MAIN", kind: "main", is_default: true });
}

export async function saveVanAction(id: string | null, input: { name: string; code: string; vehicleNumber: string; defaultStaffId: string; defaultRoute: string; isActive: boolean }): Promise<Result> {
  const ctx = await open(true);
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const name = clean(input.name, 60);
  const code = clean(input.code, 12).toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!name) return { error: "Give the van a name, e.g. Van 1." };
  if (!code) return { error: "Give the van a short code, e.g. V1 — it starts its bill numbers." };
  const staffId = /^[0-9a-f-]{36}$/i.test(input.defaultStaffId) ? input.defaultStaffId : null;
  if (staffId) {
    const { data: s } = await admin.from("staff").select("id").eq("id", staffId).eq("shop_id", session.shopId).maybeSingle();
    if (!s) return { error: "That salesman isn't on this shop's staff." };
  }
  await ensureMainGodown(admin, session.shopId);
  const row = { name, code, vehicle_number: clean(input.vehicleNumber, 20).toUpperCase() || null, default_staff_id: staffId, default_route: clean(input.defaultRoute, 60) || null, is_active: input.isActive !== false };
  const q = id
    ? db(admin).from("godowns").update(row).eq("id", id).eq("shop_id", session.shopId).eq("kind", "vehicle").select("id").maybeSingle()
    : db(admin).from("godowns").insert({ ...row, shop_id: session.shopId, kind: "vehicle" }).select("id").single();
  const { data, error } = await q;
  if (error) return { error: error.code === "23505" ? "Another van or godown already has that code." : "Couldn't save the van." };
  await logAuditEvent({ admin, shopId: session.shopId, staffId: session.userId, action: id ? "van_updated" : "van_added", entityType: "godown", entityId: (data as { id: string } | null)?.id ?? id ?? null, details: { name, code } });
  return { id: (data as { id: string } | null)?.id };
}

/** A new trip, loaded at once when lines are given (a trip can also be loaded later from its page). */
export async function startTripAction(input: { vehicleId: string; salesmanId: string; route: string; openingCash: number; lines: Line[] }): Promise<Result> {
  const ctx = await open(true);
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const { data: main } = await db(admin).from("godowns").select("id").eq("shop_id", session.shopId).eq("is_default", true).maybeSingle();
  if (!main) return { error: "Add a van first: that also sets up the main godown." };
  const { data: id, error } = await db(admin).rpc("van_trip_new", {
    p_shop: session.shopId,
    p_vehicle: input.vehicleId,
    p_source: (main as { id: string }).id,
    p_salesman: /^[0-9a-f-]{36}$/i.test(input.salesmanId) ? input.salesmanId : null,
    p_route: clean(input.route, 60),
    p_opening_cash: Math.max(0, Number(input.openingCash) || 0),
    p_staff: session.userId,
  });
  if (error || !id) return { error: failed(error) ?? "Couldn't start the trip." };
  const tripId = String(id);
  const lines = linesJson(input.lines);
  if (lines.length) {
    const { error: loadError } = await db(admin).rpc("van_trip_load", { p_shop: session.shopId, p_trip: tripId, p_lines: lines, p_staff: session.userId });
    if (loadError) return { id: tripId, error: `The trip is made but not loaded: ${failed(loadError)}` };
  }
  await logAuditEvent({ admin, shopId: session.shopId, staffId: session.userId, action: "van_trip_started", entityType: "van_trip", entityId: tripId, details: { lines: lines.length } });
  return { id: tripId };
}

/** The first load of a trip, or a top-up while it is on the route. */
export async function loadTripAction(tripId: string, lines: Line[]): Promise<Result> {
  const ctx = await open(true);
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const sent = linesJson(lines);
  if (!sent.length) return { error: "Add at least one item." };
  const { error } = await db(admin).rpc("van_trip_load", { p_shop: session.shopId, p_trip: tripId, p_lines: sent, p_staff: session.userId });
  if (error) return { error: failed(error)! };
  await logAuditEvent({ admin, shopId: session.shopId, staffId: session.userId, action: "van_trip_loaded", entityType: "van_trip", entityId: tripId, details: { lines: sent.length } });
  return {};
}

export async function cancelTripAction(tripId: string): Promise<Result> {
  const ctx = await open(true);
  if ("error" in ctx) return ctx;
  const { error } = await db(ctx.admin).rpc("van_trip_cancel", { p_shop: ctx.session.shopId, p_trip: tripId, p_staff: ctx.session.userId });
  return error ? { error: failed(error)! } : {};
}

/** The trip's salesman, the owner or a manager. */
async function tripFor(admin: Admin, session: SessionContext, tripId: string): Promise<{ salesman_id: string | null; status: string } | null> {
  const { data } = await db(admin).from("van_trips").select("salesman_id, status").eq("id", tripId).eq("shop_id", session.shopId).maybeSingle();
  return (data as { salesman_id: string | null; status: string } | null) ?? null;
}

/** The van is back: no more bills on this trip; it waits for the count. */
export async function returnTripAction(tripId: string): Promise<Result> {
  const ctx = await open(false);
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const trip = await tripFor(admin, session, tripId);
  if (!trip) return { error: "That trip wasn't found." };
  if (!mayWorkTrip(session.role, session.userId, trip.salesman_id)) return { error: "Only this trip's salesman, the owner or a manager can do this." };
  const { error } = await db(admin).rpc("van_trip_return", { p_shop: session.shopId, p_trip: tripId, p_staff: session.userId });
  return error ? { error: failed(error)! } : {};
}

export async function addExpenseAction(tripId: string, input: { kind: string; amount: number; note: string }): Promise<Result> {
  const ctx = await open(false);
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const trip = await tripFor(admin, session, tripId);
  if (!trip) return { error: "That trip wasn't found." };
  if (!mayWorkTrip(session.role, session.userId, trip.salesman_id)) return { error: "Only this trip's salesman, the owner or a manager can do this." };
  if (trip.status !== "loaded" && trip.status !== "returned") return { error: "Expenses are added while the trip is open." };
  const kind = (EXPENSE_KINDS as readonly string[]).includes(input.kind) ? (input.kind as ExpenseKind) : "other";
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!(amount > 0) || amount > 1e7) return { error: "Enter the amount." };
  const { error } = await db(admin).from("van_expenses").insert({ shop_id: session.shopId, trip_id: tripId, kind, amount, note: clean(input.note, 200) || null, staff_id: session.userId });
  return error ? { error: "Couldn't save the expense." } : {};
}

export async function removeExpenseAction(expenseId: string): Promise<Result> {
  const ctx = await open(true);
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const { data } = await db(admin).from("van_expenses").select("trip_id").eq("id", expenseId).eq("shop_id", session.shopId).maybeSingle();
  const trip = data ? await tripFor(admin, session, (data as { trip_id: string }).trip_id) : null;
  if (!trip || (trip.status !== "loaded" && trip.status !== "returned")) return { error: "An expense of a settled trip stays." };
  const { error } = await db(admin).from("van_expenses").delete().eq("id", expenseId).eq("shop_id", session.shopId);
  return error ? { error: "Couldn't remove the expense." } : {};
}

/** Settlement: the count of every item and the money handed over. The expected figures are worked out
 * here from the trip's own records, never taken from the screen. */
export async function settleTripAction(tripId: string, input: { lines: { productId: string; counted: number; damaged: number }[]; cashHanded: number; upiReceived: number; chargeSalesman: boolean; note: string }): Promise<Result> {
  const ctx = await open(true);
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const full = await loadTrip(admin, session, tripId);
  if (!full) return { error: "That trip wasn't found." };
  const counted = new Map(input.lines.map((l) => [l.productId, l]));
  const result = countResult(
    full.items
      .filter((i) => i.onVan > 0 || counted.has(i.productId))
      .map((i) => ({ productId: i.productId, name: i.name, expected: i.onVan, counted: Math.max(0, Number(counted.get(i.productId)?.counted) || 0), damaged: Math.max(0, Number(counted.get(i.productId)?.damaged) || 0), price: i.price })),
  );
  const cashHanded = Math.round(Math.max(0, Number(input.cashHanded) || 0) * 100) / 100;
  const upiReceived = Math.round(Math.max(0, Number(input.upiReceived) || 0) * 100) / 100;
  const cashShort = Math.max(0, Math.round((full.money.cashExpected - cashHanded) * 100) / 100);
  const charge = input.chargeSalesman ? Math.round((cashShort + result.shortageValue) * 100) / 100 : 0;
  const { error } = await db(admin).rpc("van_trip_settle", {
    p_shop: session.shopId,
    p_trip: tripId,
    p_lines: result.lines.map((l) => ({ product_id: l.productId, counted: l.counted, damaged: l.damaged })),
    p_money: {
      cash_expected: full.money.cashExpected,
      cash_handed: cashHanded,
      upi_expected: full.money.upiExpected,
      upi_received: upiReceived,
      shortage_value: result.shortageValue,
      salesman_charge: charge,
      note: clean(input.note, 300),
    },
    p_staff: session.userId,
  });
  if (error) return { error: failed(error)! };
  await logAuditEvent({
    admin,
    shopId: session.shopId,
    staffId: session.userId,
    action: "van_trip_settled",
    entityType: "van_trip",
    entityId: tripId,
    details: { cashExpected: full.money.cashExpected, cashHanded, upiReceived, shortageValue: result.shortageValue, damaged: result.damaged, excess: result.excess, salesmanCharge: charge },
  });
  return {};
}

// ─── Route tracking ────────────────────────────────────────────────────────────

type Fix = { lat: number; lng: number; accuracy: number | null } | null;
const fixOf = (f: Fix) =>
  f && Number.isFinite(f.lat) && Number.isFinite(f.lng) && Math.abs(f.lat) <= 90 && Math.abs(f.lng) <= 180
    ? { lat: Math.round(f.lat * 1e6) / 1e6, lng: Math.round(f.lng * 1e6) / 1e6, accuracy: f.accuracy !== null && Number.isFinite(f.accuracy) ? Math.round(f.accuracy) : null }
    : null;

/** A visit to a shop on the route ("Reached shop"), with what came of it when there was no bill. The
 * visit before it on the trip is closed. Verified when the reading is inside the shop's circle. */
export async function checkInAction(tripId: string, input: { customerId: string; outcome: string; note: string; fix: Fix }): Promise<Result & { verified?: boolean | null; needsPin?: boolean }> {
  const ctx = await open(false);
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const trip = await tripFor(admin, session, tripId);
  if (!trip) return { error: "That trip wasn't found." };
  if (!mayWorkTrip(session.role, session.userId, trip.salesman_id)) return { error: "Only this trip's salesman, the owner or a manager can do this." };
  if (trip.status !== "loaded") return { error: "Visits are recorded while the trip is on the route." };
  const outcome = (VISIT_OUTCOMES as readonly string[]).includes(input.outcome) ? input.outcome : "other";
  if (!/^[0-9a-f-]{36}$/i.test(input.customerId)) return { error: "Choose the shop." };
  const { data: cust } = await admin.from("customers").select("id").eq("id", input.customerId).eq("shop_id", session.shopId).maybeSingle();
  if (!cust) return { error: "That shop isn't in your parties." };
  const fix = fixOf(input.fix);
  const check = await visitAgainstPin(admin, session.shopId, input.customerId, fix);
  await closeOpenVisit(admin, tripId);
  const { error } = await db(admin).from("van_visits").insert({
    shop_id: session.shopId,
    trip_id: tripId,
    customer_id: input.customerId,
    latitude: fix?.lat ?? null,
    longitude: fix?.lng ?? null,
    accuracy_m: fix?.accuracy ?? null,
    distance_m: check.distance,
    verified: check.verified,
    outcome,
    note: clean(input.note, 200) || null,
    staff_id: session.userId,
  });
  if (error) return { error: "Couldn't record the visit." };
  if (fix) await db(admin).from("van_pings").insert({ shop_id: session.shopId, trip_id: tripId, staff_id: session.userId, latitude: fix.lat, longitude: fix.lng, accuracy_m: fix.accuracy, source: "checkin" });
  return { verified: check.verified, needsPin: check.noPin };
}

async function visitAgainstPin(admin: Admin, shopId: string, customerId: string, fix: ReturnType<typeof fixOf>) {
  const { data } = await db(admin).from("van_shop_locations").select("latitude, longitude, radius_m").eq("customer_id", customerId).eq("shop_id", shopId).maybeSingle();
  const pin = data as { latitude: number; longitude: number; radius_m: number } | null;
  const c = visitCheck(fix, pin ? { id: customerId, lat: Number(pin.latitude), lng: Number(pin.longitude), radius: pin.radius_m } : null);
  return { ...c, noPin: !pin };
}

async function closeOpenVisit(admin: Admin, tripId: string) {
  await db(admin).from("van_visits").update({ check_out_at: new Date().toISOString() }).eq("trip_id", tripId).is("check_out_at", null);
}

/** A shop's map pin. Saved by the salesman on the spot it waits for the owner to approve; saved or
 * moved by the owner or a manager it is approved. */
export async function saveShopPinAction(customerId: string, input: { lat: number; lng: number; radius?: number }): Promise<Result> {
  const ctx = await open(false);
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const fix = fixOf({ lat: Number(input.lat), lng: Number(input.lng), accuracy: null });
  if (!fix) return { error: "No location." };
  const { data: cust } = await admin.from("customers").select("id").eq("id", customerId).eq("shop_id", session.shopId).maybeSingle();
  if (!cust) return { error: "That shop isn't in your parties." };
  const manager = canRunVans(session.role);
  const { data: existing } = await db(admin).from("van_shop_locations").select("verified").eq("customer_id", customerId).maybeSingle();
  if (existing && (existing as { verified: boolean }).verified && !manager) return { error: "This shop's location is already approved. Ask the owner to move it." };
  const radius = Math.min(2000, Math.max(20, Math.round(Number(input.radius) || 150)));
  const { error } = await db(admin)
    .from("van_shop_locations")
    .upsert({ customer_id: customerId, shop_id: session.shopId, latitude: fix.lat, longitude: fix.lng, verified: manager, radius_m: radius, set_by: session.userId, updated_at: new Date().toISOString() });
  return error ? { error: "Couldn't save the location." } : {};
}

export async function approveShopPinAction(customerId: string): Promise<Result> {
  const ctx = await open(true);
  if ("error" in ctx) return ctx;
  const { error } = await db(ctx.admin).from("van_shop_locations").update({ verified: true }).eq("customer_id", customerId).eq("shop_id", ctx.session.shopId);
  return error ? { error: "Couldn't approve." } : {};
}

/** A new shop met on the route: a party with this trip's beat, its pin where the salesman stands. */
export async function addShopOnRouteAction(tripId: string, input: { name: string; phone: string; fix: Fix }): Promise<Result> {
  const ctx = await open(false);
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const { data } = await db(admin).from("van_trips").select("salesman_id, status, route").eq("id", tripId).eq("shop_id", session.shopId).maybeSingle();
  const trip = data as { salesman_id: string | null; status: string; route: string | null } | null;
  if (!trip || !mayWorkTrip(session.role, session.userId, trip.salesman_id)) return { error: "That trip wasn't found." };
  const name = clean(input.name, 120);
  const phone = clean(input.phone, 15).replace(/\D/g, "");
  if (!name) return { error: "Enter the shop's name." };
  if (phone.length !== 10) return { error: "Enter a 10-digit mobile number." };
  const made = await findOrCreateCustomerByPhone(admin, session.shopId, phone, name);
  if (!made || "error" in made) return { error: made && "error" in made ? String(made.error) : "Couldn't add the shop." };
  if (trip.route) await admin.from("customers").update({ beat: trip.route } as never).eq("id", made.id).eq("shop_id", session.shopId).is("beat" as never, null);
  const fix = fixOf(input.fix);
  if (fix) await db(admin).from("van_shop_locations").upsert({ customer_id: made.id, shop_id: session.shopId, latitude: fix.lat, longitude: fix.lng, verified: canRunVans(session.role), set_by: session.userId });
  return { id: made.id };
}
