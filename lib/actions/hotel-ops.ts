"use server";

import { randomBytes } from "node:crypto";
import { requireSession, type SessionContext } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { isModuleEnabled, MODULES, type ModuleKey } from "../modules";
import { logAuditEvent } from "../audit";
import { billLimitError } from "../planLimits";
import { issueInvoiceNumber } from "../invoiceNumber";
import { financialYearFor, GSTIN_REGEX, round2 } from "../gst";
import { buyerSchemaReady, stateFromGstin } from "../gstBuyer";
import { normalizePhone } from "../phone";
import { calculateTransactionTotals } from "../validation/schemas";
import { moveStock } from "../stockMoves";
import { invalidateCache } from "../cache";
import { recordCashMovement } from "../cashMovements";
import { findOrCreateCustomerByPhone } from "./customers";
import { hotelSchemaReady, currentGuestForRoom } from "../hotel/server";
import { hotelOpsReady, loose, syncIcalFeed } from "../hotel/ops";
import { isIsoDate } from "../hotel/dates";
import { HK_STAGES, TICKET_CATEGORIES, TICKET_PRIORITIES, type HkStage } from "../hotel/housekeeping";
import { icalUrlProblem } from "../hotel/ical";
import { eventLines, eventsClash, SESSIONS, type EventSession } from "../hotel/events";
import { PAYMENT_METHODS, type PaymentMethod } from "../hotel/constants";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
export type OpsResult = { error?: string; id?: string };
type Ctx = { session: SessionContext; admin: Admin };

const NOT_READY = "This needs a database update first (migration 0065).";

async function open(module: ModuleKey | null = null, managersOnly = false): Promise<Ctx | { error: string }> {
  const session = await requireSession();
  if (session.businessType !== "hotel") return { error: "This is for hotels." };
  const admin = createSupabaseAdminClient();
  if (!(await hotelSchemaReady(admin)) || !(await hotelOpsReady(admin))) return { error: NOT_READY };
  if (module && !isModuleEnabled(session.enabledModules, module)) return { error: `"${MODULES.find((m) => m.key === module)?.label ?? module}" isn't in your plan — see Plan & billing.` };
  if (managersOnly && session.role !== "owner" && session.role !== "manager") return { error: "Only the owner or a manager can do this." };
  return { session, admin };
}

/** Whether an id sent by the browser is this shop's own row. */
async function owns(ctx: Ctx, table: "hotel_rooms" | "hotel_room_types" | "hotel_halls", id: string | null) {
  if (!id) return true;
  const { data } = await loose(ctx.admin).from(table).select("id").eq("id", id).eq("shop_id", ctx.session.shopId).maybeSingle();
  return !!data;
}

const clean = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null);
// Saves answer at once and the screen refreshes itself: a page in the reply held each save ~1 s.

// ─── Housekeeping ──────────────────────────────────────────────────────────────
export async function setHousekeepingAction(roomId: string, stage: HkStage): Promise<OpsResult> {
  const ctx = await open("hotel_operations");
  if ("error" in ctx) return ctx;
  if (!HK_STAGES.includes(stage)) return { error: "Pick a state." };
  const { error } = await loose(ctx.admin).from("hotel_rooms").update({ housekeeping: stage, housekeeping_by: ctx.session.userId }).eq("id", roomId).eq("shop_id", ctx.session.shopId);
  if (error) return { error: "Could not update the room." };
  return {};
}

export async function assignRoomsAction(roomIds: string[], staffId: string | null): Promise<OpsResult> {
  const ctx = await open("hotel_operations", true);
  if ("error" in ctx) return ctx;
  if (!roomIds.length) return { error: "Pick at least one room." };
  if (staffId) {
    const { data } = await ctx.admin.from("staff").select("id").eq("id", staffId).eq("shop_id", ctx.session.shopId).maybeSingle();
    if (!data) return { error: "Staff member not found." };
  }
  const { error } = await loose(ctx.admin).from("hotel_rooms").update({ assigned_to: staffId }).in("id", roomIds).eq("shop_id", ctx.session.shopId);
  if (error) return { error: "Could not assign the rooms." };
  return {};
}

// ─── Maintenance ───────────────────────────────────────────────────────────────
/** A problem reported, by anyone. With `blockRoom` a manager also takes the room out of order, unless
 * a guest is in it. */
export async function createTicketAction(input: { roomId: string | null; category: string; priority: string; title: string; note: string; assignedTo: string; blockRoom: boolean; backOn: string | null }): Promise<OpsResult> {
  const ctx = await open("hotel_operations");
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const title = clean(input.title, 120);
  if (!title) return { error: "Say what is wrong." };
  if (!(await owns(ctx, "hotel_rooms", input.roomId))) return { error: "Room not found." };
  if (!(TICKET_CATEGORIES as readonly string[]).includes(input.category)) return { error: "Pick the kind of problem." };
  if (!(TICKET_PRIORITIES as readonly string[]).includes(input.priority)) return { error: "Pick how urgent it is." };
  if (input.blockRoom) {
    if (!input.roomId) return { error: "Pick the room to take out of order." };
    if (session.role !== "owner" && session.role !== "manager") return { error: "Only the owner or a manager can take a room out of order." };
    const guest = await currentGuestForRoom(admin, session.shopId, input.roomId);
    if (guest) return { error: `${guest.guestName} is staying in this room — move or check them out first.` };
  }
  const { data, error } = await loose(admin)
    .from("hotel_maintenance_tickets")
    .insert({ shop_id: session.shopId, room_id: input.roomId, category: input.category, priority: input.priority, title, note: clean(input.note, 500), assigned_to: clean(input.assignedTo, 80), blocks_room: input.blockRoom, reported_by: session.userId })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not save the ticket." };
  if (input.blockRoom && input.roomId) {
    await loose(admin).from("hotel_rooms").update({ is_blocked: true, block_reason: title, blocked_until: input.backOn && isIsoDate(input.backOn) ? input.backOn : null }).eq("id", input.roomId).eq("shop_id", session.shopId);
  }
  return { id: data.id };
}

/** A ticket moved on. Finishing one that took its room out of order puts the room back, needing cleaning. */
export async function ticketStepAction(id: string, status: "in_progress" | "done" | "cancelled", resolution = "", cost: number | null = null): Promise<OpsResult> {
  const ctx = await open("hotel_operations");
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const db = loose(admin);
  const { data: ticket } = await db.from("hotel_maintenance_tickets").select("id, room_id, blocks_room, status").eq("id", id).eq("shop_id", session.shopId).maybeSingle();
  if (!ticket) return { error: "Ticket not found." };
  if (ticket.status === "done" || ticket.status === "cancelled") return { error: "This ticket is already closed." };
  const closing = status === "done" || status === "cancelled";
  const { error } = await db
    .from("hotel_maintenance_tickets")
    .update({ status, ...(closing ? { resolved_at: new Date().toISOString(), resolution: clean(resolution, 300), cost: cost !== null && cost >= 0 ? round2(cost) : null } : {}) })
    .eq("id", id);
  if (error) return { error: "Could not update the ticket." };
  if (closing && ticket.blocks_room && ticket.room_id) {
    await db.from("hotel_rooms").update({ is_blocked: false, block_reason: null, blocked_until: null, housekeeping: "dirty", housekeeping_by: session.userId }).eq("id", ticket.room_id).eq("shop_id", session.shopId);
  }
  return {};
}

// ─── Rate rules ────────────────────────────────────────────────────────────────
export type RateRuleInput = { name: string; roomTypeId: string | null; startDate: string | null; endDate: string | null; weekdays: number[] | null; kind: "set" | "percent" | "amount"; value: number; minOccupancy: number | null; minStay: number | null; closedToArrival: boolean };

export async function saveRateRuleAction(id: string | null, input: RateRuleInput): Promise<OpsResult> {
  const ctx = await open("hotel_operations", true);
  if ("error" in ctx) return ctx;
  const name = clean(input.name, 60);
  if (!name) return { error: "Name the rule, e.g. Weekend or Diwali." };
  if (!(await owns(ctx, "hotel_room_types", input.roomTypeId))) return { error: "Pick the room type." };
  if (!["set", "percent", "amount"].includes(input.kind)) return { error: "Pick how the rate changes." };
  const value = Number(input.value);
  if (!Number.isFinite(value)) return { error: "Enter the amount." };
  if (input.kind === "set" && value <= 0) return { error: "Enter the rate for these nights." };
  if (input.kind === "percent" && (value < -90 || value > 500)) return { error: "The % should be between -90 and 500." };
  for (const d of [input.startDate, input.endDate]) if (d && !isIsoDate(d)) return { error: "Check the dates." };
  if (input.startDate && input.endDate && input.endDate < input.startDate) return { error: "The end date is before the start date." };
  const minOccupancy = input.minOccupancy === null ? null : Math.round(Number(input.minOccupancy));
  if (minOccupancy !== null && !(minOccupancy >= 0 && minOccupancy <= 100)) return { error: "Occupancy should be between 0 and 100%." };
  const minStay = input.minStay === null ? null : Math.round(Number(input.minStay));
  if (minStay !== null && !(minStay >= 1 && minStay <= 90)) return { error: "Minimum stay should be between 1 and 90 nights." };
  const row = {
    shop_id: ctx.session.shopId,
    name,
    room_type_id: input.roomTypeId,
    start_date: input.startDate,
    end_date: input.endDate,
    weekdays: input.weekdays?.length ? input.weekdays.filter((d) => d >= 0 && d <= 6) : null,
    kind: input.kind,
    value: round2(value),
    min_occupancy: minOccupancy,
    min_stay: minStay,
    closed_to_arrival: !!input.closedToArrival,
  };
  const db = loose(ctx.admin).from("hotel_rate_rules");
  const { error } = id ? await db.update(row).eq("id", id).eq("shop_id", ctx.session.shopId) : await db.insert(row);
  if (error) return { error: "Could not save the rule." };
  return {};
}

export async function setRateRuleActiveAction(id: string, active: boolean): Promise<OpsResult> {
  const ctx = await open("hotel_operations", true);
  if ("error" in ctx) return ctx;
  const { error } = await loose(ctx.admin).from("hotel_rate_rules").update({ is_active: active }).eq("id", id).eq("shop_id", ctx.session.shopId);
  if (error) return { error: "Could not change the rule." };
  return {};
}

export async function deleteRateRuleAction(id: string): Promise<OpsResult> {
  const ctx = await open("hotel_operations", true);
  if ("error" in ctx) return ctx;
  const { error } = await loose(ctx.admin).from("hotel_rate_rules").delete().eq("id", id).eq("shop_id", ctx.session.shopId);
  if (error) return { error: "Could not delete the rule." };
  return {};
}

// ─── Night audit ───────────────────────────────────────────────────────────────
/** Closes a business day: keeps its figures as they stand. Bills and bookings aren't locked by it. */
export async function closeNightAuditAction(date: string, figures: unknown, note: string): Promise<OpsResult> {
  const ctx = await open("hotel_operations", true);
  if ("error" in ctx) return ctx;
  if (!isIsoDate(date)) return { error: "Check the date." };
  const { error } = await loose(ctx.admin)
    .from("hotel_night_audits")
    .upsert({ shop_id: ctx.session.shopId, business_date: date, figures, note: clean(note, 500), closed_by: ctx.session.userId, closed_at: new Date().toISOString() }, { onConflict: "shop_id,business_date" });
  if (error) return { error: "Could not close the day." };
  await logAuditEvent({ admin: ctx.admin, shopId: ctx.session.shopId, staffId: ctx.session.userId, action: "hotel_night_audit", entityType: "hotel_night_audit", details: { date } });
  return {};
}

// ─── Companies and agents ──────────────────────────────────────────────────────
export type AccountInput = { kind: "company" | "agent"; name: string; gstin: string; address: string; contactPerson: string; phone: string; email: string; discountPercent: number; commissionPercent: number; creditDays: number | null };

export async function saveAccountAction(id: string | null, input: AccountInput): Promise<OpsResult> {
  const ctx = await open("hotel_operations");
  if ("error" in ctx) return ctx;
  const name = clean(input.name, 120);
  if (!name) return { error: "Enter the name." };
  const gstin = clean(input.gstin, 15)?.toUpperCase() ?? null;
  if (gstin && !GSTIN_REGEX.test(gstin)) return { error: "Enter a valid 15-character GSTIN, like 27ABCDE1234F1Z5." };
  const pct = (v: unknown) => Math.min(100, Math.max(0, Number(v) || 0));
  const row = {
    shop_id: ctx.session.shopId,
    kind: input.kind === "agent" ? "agent" : "company",
    name,
    gstin,
    address: clean(input.address, 300),
    contact_person: clean(input.contactPerson, 80),
    phone: clean(input.phone, 20),
    email: clean(input.email, 120),
    discount_percent: pct(input.discountPercent),
    commission_percent: pct(input.commissionPercent),
    credit_days: input.creditDays === null ? null : Math.max(0, Math.round(Number(input.creditDays)) || 0),
  };
  const db = loose(ctx.admin).from("hotel_accounts");
  const { error } = id ? await db.update(row).eq("id", id).eq("shop_id", ctx.session.shopId) : await db.insert(row);
  if (error) return { error: error.code === "23505" ? "There is already an account with that name." : "Could not save the account." };
  return {};
}

export async function archiveAccountAction(id: string): Promise<OpsResult> {
  const ctx = await open("hotel_operations");
  if ("error" in ctx) return ctx;
  const { error } = await loose(ctx.admin).from("hotel_accounts").update({ is_active: false }).eq("id", id).eq("shop_id", ctx.session.shopId);
  if (error) return { error: "Could not remove the account." };
  return {};
}

// ─── Guest details and Form C ──────────────────────────────────────────────────
export type GuestDetailsInput = Partial<Record<"nationality" | "guestAddress" | "gender" | "dateOfBirth" | "passportNumber" | "passportIssuedAt" | "passportIssueDate" | "passportExpiry" | "visaNumber" | "visaType" | "visaIssuedAt" | "visaIssueDate" | "visaExpiry" | "arrivalInIndia" | "arrivedFrom" | "goingTo" | "visitPurpose" | "formCReference", string>>;

const DATE_FIELDS: [keyof GuestDetailsInput, string][] = [["dateOfBirth", "date_of_birth"], ["passportIssueDate", "passport_issue_date"], ["passportExpiry", "passport_expiry"], ["visaIssueDate", "visa_issue_date"], ["visaExpiry", "visa_expiry"], ["arrivalInIndia", "arrival_in_india"]];
const TEXT_FIELDS: [keyof GuestDetailsInput, string][] = [["guestAddress", "guest_address"], ["gender", "gender"], ["passportNumber", "passport_number"], ["passportIssuedAt", "passport_issued_at"], ["visaNumber", "visa_number"], ["visaType", "visa_type"], ["visaIssuedAt", "visa_issued_at"], ["arrivedFrom", "arrived_from"], ["goingTo", "going_to"], ["visitPurpose", "visit_purpose"], ["formCReference", "form_c_reference"]];

export async function saveGuestDetailsAction(bookingId: string, input: GuestDetailsInput): Promise<OpsResult> {
  const ctx = await open();
  if ("error" in ctx) return ctx;
  const patch: Record<string, string | null> = {};
  for (const [key, col] of DATE_FIELDS) {
    const v = input[key];
    if (v === undefined) continue;
    if (v && !isIsoDate(v)) return { error: "Check the dates." };
    patch[col] = v || null;
  }
  for (const [key, col] of TEXT_FIELDS) if (input[key] !== undefined) patch[col] = clean(input[key], 200);
  const nationality = clean(input.nationality, 60);
  if (nationality) patch.nationality = nationality;
  const { error } = await loose(ctx.admin).from("hotel_bookings").update(patch).eq("id", bookingId).eq("shop_id", ctx.session.shopId);
  if (error) return { error: "Could not save the guest's details." };
  return {};
}

/** The hotel's note that it filed the guest on the FRRO portal; the app can't file it itself. */
export async function markFormCFiledAction(bookingId: string, filed: boolean, reference: string): Promise<OpsResult> {
  const ctx = await open();
  if ("error" in ctx) return ctx;
  const { error } = await loose(ctx.admin)
    .from("hotel_bookings")
    .update({ form_c_filed_at: filed ? new Date().toISOString() : null, form_c_reference: filed ? clean(reference, 60) : null })
    .eq("id", bookingId)
    .eq("shop_id", ctx.session.shopId);
  if (error) return { error: "Could not save that." };
  return {};
}

// ─── Items posted to a room (minibar, toiletries) ──────────────────────────────
/** An item from the shop's list on the guest's account: its stock comes down, and removing the charge
 * puts it back. The account holds amounts before tax, so a GST-inclusive price is worked back. */
export async function chargeableItemsAction(): Promise<{ error?: string; items?: { id: string; name: string; price: number; stock: number | null }[] }> {
  const ctx = await open("hotel_operations");
  if ("error" in ctx) return ctx;
  const { data } = await ctx.admin.from("products").select("id, name, price, stock_quantity, track_inventory").eq("shop_id", ctx.session.shopId).order("name").limit(1000);
  return { items: (data ?? []).map((p) => ({ id: p.id, name: p.name, price: Number(p.price), stock: p.track_inventory ? Number(p.stock_quantity) : null })) };
}

export async function addItemChargeAction(input: { bookingId: string; productId: string; quantity: number; kind: string }): Promise<OpsResult> {
  const ctx = await open("hotel_operations");
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const quantity = Math.round(Number(input.quantity) * 1000) / 1000;
  if (!(quantity > 0)) return { error: "Enter how many." };
  const { data: booking } = await admin.from("hotel_bookings").select("status").eq("id", input.bookingId).eq("shop_id", session.shopId).maybeSingle();
  if (!booking) return { error: "Booking not found" };
  if (booking.status !== "reserved" && booking.status !== "checked_in") return { error: "This booking is closed." };
  const { data: item } = await admin.from("products").select("id, name, price, gst_percent, track_inventory").eq("id", input.productId).eq("shop_id", session.shopId).maybeSingle();
  if (!item) return { error: "Item not found." };
  const gst = Number(item.gst_percent);
  const each = session.priceIncludesGst ? Number(item.price) / (1 + gst / 100) : Number(item.price);
  const { data: charge, error } = await loose(admin)
    .from("hotel_charges")
    .insert({ booking_id: input.bookingId, shop_id: session.shopId, kind: input.kind || "minibar", description: quantity === 1 ? item.name : `${item.name} × ${quantity}`, amount: round2(each * quantity), gst_percent: gst, posted_by: session.userId, product_id: item.id, quantity })
    .select("id")
    .single();
  if (error || !charge) return { error: "Could not add the charge." };
  if (item.track_inventory) {
    const moved = await moveStock(admin, { shopId: session.shopId, staffId: session.userId, source: "restaurant", sourceId: charge.id, take: [{ productId: item.id, quantity }], allowShort: true });
    if (!moved.ok) console.error("Hotel item charge: stock not taken", charge.id, moved.error);
    await invalidateCache(`ray:cache:products:${session.shopId}`);
  }
  return {};
}

// ─── Direct booking page ───────────────────────────────────────────────────────
export async function savePublicPageAction(input: { enabled: boolean; about: string; policies: string; contactPhone: string }): Promise<OpsResult> {
  const ctx = await open("hotel_direct", true);
  if ("error" in ctx) return ctx;
  const db = loose(ctx.admin).from("hotel_public_pages");
  const { data: existing } = await db.select("token").eq("shop_id", ctx.session.shopId).maybeSingle();
  const { error } = await db.upsert({ shop_id: ctx.session.shopId, token: existing?.token ?? randomBytes(12).toString("base64url"), is_enabled: !!input.enabled, about: clean(input.about, 800), policies: clean(input.policies, 800), contact_phone: clean(input.contactPhone, 20) });
  if (error) return { error: "Could not save the page." };
  return {};
}

export async function declineRequestAction(id: string): Promise<OpsResult> {
  const ctx = await open("hotel_direct");
  if ("error" in ctx) return ctx;
  const { error } = await loose(ctx.admin).from("hotel_booking_requests").update({ status: "declined" }).eq("id", id).eq("shop_id", ctx.session.shopId).eq("status", "new");
  if (error) return { error: "Could not update the request." };
  return {};
}

// ─── iCal calendars ────────────────────────────────────────────────────────────
export async function addIcalFeedAction(input: { roomTypeId: string; label: string; url: string }): Promise<OpsResult> {
  const ctx = await open("hotel_direct", true);
  if ("error" in ctx) return ctx;
  const problem = icalUrlProblem(input.url);
  if (problem) return { error: problem };
  const label = clean(input.label, 40);
  if (!label) return { error: "Say which site this is." };
  const { data: type } = await ctx.admin.from("hotel_room_types").select("id").eq("id", input.roomTypeId).eq("shop_id", ctx.session.shopId).maybeSingle();
  if (!type) return { error: "Pick the room type." };
  const { data, error } = await loose(ctx.admin).from("hotel_ical_feeds").insert({ shop_id: ctx.session.shopId, room_type_id: input.roomTypeId, label, url: input.url.trim() }).select("id").single();
  if (error || !data) return { error: error?.code === "23505" ? "That calendar is already added." : "Could not add the calendar." };
  const synced = await syncIcalFeed(ctx.admin, ctx.session.shopId, data.id);
  return synced.error ? { error: `Added, but it couldn't be read: ${synced.error}` } : {};
}

export async function removeIcalFeedAction(id: string): Promise<OpsResult> {
  const ctx = await open("hotel_direct", true);
  if ("error" in ctx) return ctx;
  const { error } = await loose(ctx.admin).from("hotel_ical_feeds").delete().eq("id", id).eq("shop_id", ctx.session.shopId);
  if (error) return { error: "Could not remove the calendar." };
  return {};
}

export async function syncIcalFeedsAction(): Promise<OpsResult> {
  const ctx = await open("hotel_direct");
  if ("error" in ctx) return ctx;
  const { data: feeds } = await loose(ctx.admin).from("hotel_ical_feeds").select("id, label").eq("shop_id", ctx.session.shopId);
  const failed: string[] = [];
  for (const f of feeds ?? []) if ((await syncIcalFeed(ctx.admin, ctx.session.shopId, f.id)).error) failed.push(f.label);
  return failed.length ? { error: `Couldn't read: ${failed.join(", ")}` } : {};
}

// ─── Banquet and events ────────────────────────────────────────────────────────
export async function saveHallAction(id: string | null, input: { name: string; capacity: number | null; rate: number }): Promise<OpsResult> {
  const ctx = await open("hotel_events", true);
  if ("error" in ctx) return ctx;
  const name = clean(input.name, 60);
  if (!name) return { error: "Enter the hall's name." };
  const row = { shop_id: ctx.session.shopId, name, capacity: input.capacity === null ? null : Math.max(0, Math.round(Number(input.capacity)) || 0), rate: round2(Math.max(0, Number(input.rate) || 0)) };
  const db = loose(ctx.admin).from("hotel_halls");
  const { error } = id ? await db.update(row).eq("id", id).eq("shop_id", ctx.session.shopId) : await db.insert(row);
  if (error) return { error: "Could not save the hall." };
  return {};
}

export type EventInput = {
  hallId: string | null;
  eventName: string;
  clientName: string;
  clientPhone: string;
  companyName: string;
  companyGstin: string;
  companyAddress: string;
  eventDate: string;
  session: EventSession;
  guests: number;
  hallRent: number;
  plateRate: number;
  plates: number;
  decoration: number;
  otherAmount: number;
  otherLabel: string;
  gstPercent: number;
  menu: string;
  note: string;
  status: "enquiry" | "confirmed";
};

const num = (v: unknown) => Math.max(0, Number(v) || 0);

/** Another confirmed event in this hall on that day and session, if any. */
async function hallClash(ctx: Ctx, hallId: string, date: string, session: EventSession, exceptId: string | null) {
  const { data } = await loose(ctx.admin).from("hotel_events").select("id, event_name, session").eq("shop_id", ctx.session.shopId).eq("hall_id", hallId).eq("event_date", date).in("status", ["confirmed", "completed"]);
  return (data ?? []).find((e) => e.id !== exceptId && eventsClash(e.session, session))?.event_name ?? null;
}

export async function saveEventAction(id: string | null, input: EventInput): Promise<OpsResult> {
  const ctx = await open("hotel_events");
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const eventName = clean(input.eventName, 80);
  const clientName = clean(input.clientName, 120);
  if (!eventName) return { error: "Say what the event is, e.g. Sharma wedding reception." };
  if (!clientName) return { error: "Enter the client's name." };
  if (!isIsoDate(input.eventDate)) return { error: "Choose the event's date." };
  if (!(SESSIONS as readonly string[]).includes(input.session)) return { error: "Pick the session." };
  const gstin = clean(input.companyGstin, 15)?.toUpperCase() ?? null;
  if (gstin && !GSTIN_REGEX.test(gstin)) return { error: "Enter a valid 15-character GSTIN, like 27ABCDE1234F1Z5." };
  if (!(await owns(ctx, "hotel_halls", input.hallId))) return { error: "Hall not found." };
  const status = input.status === "confirmed" ? "confirmed" : "enquiry";
  if (status === "confirmed" && input.hallId) {
    const clash = await hallClash(ctx, input.hallId, input.eventDate, input.session, id);
    if (clash) return { error: `This hall is already booked for "${clash}" in that session.` };
  }
  const row = {
    shop_id: session.shopId,
    hall_id: input.hallId,
    event_name: eventName,
    client_name: clientName,
    client_phone: clean(input.clientPhone, 20),
    company_name: clean(input.companyName, 120),
    company_gstin: gstin,
    company_address: clean(input.companyAddress, 300),
    event_date: input.eventDate,
    session: input.session,
    guests: Math.round(num(input.guests)),
    hall_rent: round2(num(input.hallRent)),
    plate_rate: round2(num(input.plateRate)),
    plates: Math.round(num(input.plates)),
    decoration: round2(num(input.decoration)),
    other_amount: round2(num(input.otherAmount)),
    other_label: clean(input.otherLabel, 60),
    gst_percent: Math.min(40, num(input.gstPercent)),
    menu: clean(input.menu, 1000),
    note: clean(input.note, 500),
    status,
  };
  const db = loose(admin).from("hotel_events");
  if (id) {
    const { data: existing } = await db.select("bill_id, status").eq("id", id).eq("shop_id", session.shopId).maybeSingle();
    if (!existing) return { error: "Event not found." };
    if (existing.bill_id) return { error: "This event is invoiced; it can't be changed." };
    const { error } = await db.update(row).eq("id", id);
    if (error) return { error: error.code === "23505" ? "This hall is already booked in that session." : "Could not save the event." };
    return { id };
  }
  const { count } = await db.select("id", { count: "exact", head: true }).eq("shop_id", session.shopId);
  const { data, error } = await db.insert({ ...row, event_number: `EV/${financialYearFor(new Date())}/${String((count ?? 0) + 1).padStart(4, "0")}`, created_by: session.userId }).select("id").single();
  if (error || !data) return { error: error?.code === "23505" ? (error.message.includes("event_number") ? "Please press Save again." : "This hall is already booked in that session.") : "Could not save the event." };
  return { id: data.id };
}

export async function cancelEventAction(id: string): Promise<OpsResult> {
  const ctx = await open("hotel_events");
  if ("error" in ctx) return ctx;
  const db = loose(ctx.admin).from("hotel_events");
  const { data: e } = await db.select("bill_id").eq("id", id).eq("shop_id", ctx.session.shopId).maybeSingle();
  if (!e) return { error: "Event not found." };
  if (e.bill_id) return { error: "This event is invoiced; cancel its bill from Bills instead." };
  const { error } = await db.update({ status: "cancelled" }).eq("id", id);
  if (error) return { error: "Could not cancel the event." };
  return {};
}

/** Money for an event. It counts in the day's money when it comes in, through the app's own record of
 * advances; the invoice later takes it off that day's sales, so it is never counted twice. */
export async function addEventPaymentAction(input: { eventId: string; kind: "advance" | "payment" | "refund"; amount: number; method: PaymentMethod; reference: string }): Promise<OpsResult> {
  const ctx = await open("hotel_events");
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const amount = round2(Number(input.amount));
  if (!(amount > 0)) return { error: "Enter the amount." };
  if (!PAYMENT_METHODS.includes(input.method)) return { error: "Choose how it was paid." };
  if (input.kind === "refund" && session.role !== "owner" && session.role !== "manager") return { error: "Only the owner or a manager can give money back." };
  const { data: e } = await loose(admin).from("hotel_events").select("id, event_name, bill_id").eq("id", input.eventId).eq("shop_id", session.shopId).maybeSingle();
  if (!e) return { error: "Event not found." };
  if (e.bill_id) return { error: "This event is invoiced; take further money on the customer's account." };
  const { error } = await loose(admin).from("hotel_event_payments").insert({ shop_id: session.shopId, event_id: e.id, kind: input.kind, amount, payment_method: input.method, reference: clean(input.reference, 80), created_by: session.userId });
  if (error) return { error: "Could not record the payment." };
  await recordCashMovement(admin, { shopId: session.shopId, staffId: session.userId, kind: input.kind === "refund" ? "refund_given" : "advance_received", source: "reservation", sourceId: e.id, method: input.method, amount, note: `Event: ${e.event_name}` });
  return {};
}

/** The event's GST invoice, as an ordinary bill: reports and the customer's balance pick it up. */
export async function invoiceEventAction(id: string): Promise<OpsResult & { billId?: string }> {
  const ctx = await open("hotel_events");
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const db = loose(admin);
  const { data: e } = await db.from("hotel_events").select("*").eq("id", id).eq("shop_id", session.shopId).maybeSingle();
  if (!e) return { error: "Event not found." };
  if (e.bill_id) return { error: "This event is already invoiced." };
  if (e.status === "cancelled") return { error: "This event is cancelled." };
  const limit = await billLimitError(session);
  if (limit) return { error: limit };
  const composition = session.gstScheme === "composition";
  const items = eventLines({ hallRent: Number(e.hall_rent), plates: e.plates, plateRate: Number(e.plate_rate), decoration: Number(e.decoration), otherAmount: Number(e.other_amount), otherLabel: e.other_label, gstPercent: composition ? 0 : Number(e.gst_percent), eventName: e.event_name });
  if (!items.length) return { error: "Add the hall rent, plates or another amount first." };
  const { data: paid } = await db.from("hotel_event_payments").select("kind, amount, payment_method").eq("event_id", id);
  const received = round2((paid ?? []).reduce((s, p) => s + (p.kind === "refund" ? -Number(p.amount) : Number(p.amount)), 0));
  const totals = calculateTransactionTotals({ items: items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice, gstPercent: i.gstPercent })), discountType: "flat", discountValue: 0, paidAmount: 0, supplyType: "intra", priceMode: "exclusive" });
  if (received > totals.total + 0.009) return { error: `${received} was received against an invoice of ${totals.total}. Record the refund of the difference first.` };
  const credit = Math.max(0, round2(totals.total - received));
  let customerId: string | null = e.customer_id;
  if (!customerId && e.client_phone) customerId = (await findOrCreateCustomerByPhone(admin, session.shopId, normalizePhone(e.client_phone), e.client_name))?.id ?? null;
  if (credit > 0.009 && !customerId) return { error: "To leave a balance due, add the client's mobile number first." };
  const issued = await issueInvoiceNumber(admin, session.shopId);
  if (!issued) return { error: "Could not generate an invoice number. Please try again." };
  const state = e.company_gstin ? stateFromGstin(e.company_gstin) : null;
  const methods = (paid ?? []).filter((p) => p.kind !== "refund").sort((a, b) => Number(b.amount) - Number(a.amount));
  const { data: bill, error } = await admin
    .from("bills")
    .insert({
      shop_id: session.shopId,
      customer_id: customerId,
      staff_id: session.userId,
      invoice_number: issued.invoiceNumber,
      financial_year: issued.financialYear,
      subtotal: totals.subtotal,
      discount_type: "flat",
      discount_value: 0,
      discount_amount: 0,
      payment_method: methods[0]?.payment_method ?? "cash",
      taxable_amount: totals.taxableAmount,
      price_includes_gst: false,
      supply_type: "intra",
      cgst_amount: totals.cgstAmount,
      sgst_amount: totals.sgstAmount,
      igst_amount: totals.igstAmount,
      gst_amount: totals.gstAmount,
      round_off_amount: totals.roundOffAmount,
      total: totals.total,
      paid_amount: round2(totals.total - credit),
      credit_amount: credit,
      ...((await buyerSchemaReady(admin)) ? { buyer_name: e.company_name ?? e.client_name, buyer_gstin: e.company_gstin, buyer_address: e.company_address, buyer_state: state?.name ?? null, buyer_state_code: state?.code ?? null } : {}),
    } as never)
    .select("id")
    .single();
  if (error || !bill) return { error: "Could not create the invoice." };
  const billId = (bill as { id: string }).id;
  const rows = items.map((item, i) => {
    const line = totals.lines[i];
    return { bill_id: billId, product_id: null, product_name: item.description, hsn_code: item.hsnCode, quantity: item.quantity, unit_price: item.unitPrice, gst_percent: item.gstPercent, line_subtotal: line.lineSubtotal, cgst_amount: line.cgst, sgst_amount: line.sgst, igst_amount: line.igst, line_gst: line.lineGst, line_total: round2(line.lineSubtotal + line.lineGst) };
  });
  const { error: itemsError } = await admin.from("bill_items").insert(rows as never);
  if (itemsError) {
    await admin.from("bills").delete().eq("id", billId);
    return { error: "Could not save the invoice lines." };
  }
  await db.from("hotel_events").update({ bill_id: billId, status: "completed", customer_id: customerId }).eq("id", id);
  // What was already counted when it came in comes off today's sales, by the mode it was paid in.
  const net = new Map<string, number>();
  for (const p of paid ?? []) net.set(p.payment_method, (net.get(p.payment_method) ?? 0) + (p.kind === "refund" ? -Number(p.amount) : Number(p.amount)));
  for (const [method, amount] of net) {
    if (amount > 0) await recordCashMovement(admin, { shopId: session.shopId, staffId: session.userId, kind: "advance_applied", source: "reservation", sourceId: id, method: method as PaymentMethod, amount: round2(amount), note: `Event invoice ${issued.invoiceNumber}`, billId });
  }
  return { billId };
}
