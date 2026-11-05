import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "../supabase/admin";
import { allRows } from "../supabase/allRows";
import { todayIso } from "../dateHelpers";
import { addDays, nightDates, nightsBetween } from "./dates";
import { availabilityByType, type BookedRoomLite, type RoomLite } from "./availability";
import { eventAmounts } from "./events";
import { auditIssues, type AuditIssue, type FlashFigures } from "./flash";
import { icalUrlProblem, parseIcal } from "./ical";
import { occupancyByDate, quoteStay, type RateRule, type StayQuote } from "./rates";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Migration 0065's tables aren't in the generated types yet. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loose = SupabaseClient<any, any, any>;
export const loose = (admin: Admin) => admin as unknown as Loose;

let ready = false;
/** Whether migration 0065 (hotel operations) has been run. Until it has, the hotel works exactly as
 * before and the new screens say so. */
export async function hotelOpsReady(admin: Admin = createSupabaseAdminClient()): Promise<boolean> {
  if (ready) return true;
  const { error } = await loose(admin).from("hotel_maintenance_tickets").select("id").limit(1);
  if (error) return false;
  ready = true;
  return true;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Rates ─────────────────────────────────────────────────────────────────────
export async function loadRateRules(admin: Admin, shopId: string): Promise<RateRule[]> {
  if (!(await hotelOpsReady(admin))) return [];
  const { data } = await loose(admin).from("hotel_rate_rules").select("*").eq("shop_id", shopId).order("created_at");
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    roomTypeId: r.room_type_id,
    startDate: r.start_date,
    endDate: r.end_date,
    weekdays: r.weekdays,
    kind: r.kind,
    value: Number(r.value),
    minOccupancy: r.min_occupancy,
    minStay: r.min_stay,
    closedToArrival: !!r.closed_to_arrival,
    isActive: !!r.is_active,
  }));
}

/** Each room type's price for a stay, under the rules. How full a night is decides the occupancy rules. */
export function quotesForStay(input: { rules: RateRule[]; types: { id: string; baseRate: number }[]; rooms: RoomLite[]; booked: BookedRoomLite[]; checkIn: string; checkOut: string }): Record<string, StayQuote> {
  const occupancy = occupancyByDate({ rooms: input.rooms, booked: input.booked, from: input.checkIn, days: Math.max(1, nightsBetween(input.checkIn, input.checkOut)) });
  const out: Record<string, StayQuote> = {};
  for (const t of input.types) out[t.id] = quoteStay({ baseRate: t.baseRate, typeId: t.id, checkIn: input.checkIn, checkOut: input.checkOut, rules: input.rules, occupancy: (d) => occupancy.get(d) ?? 0 });
  return out;
}

// ─── iCal ──────────────────────────────────────────────────────────────────────
/** Dates booking sites have sold (iCal), as stock taken: one room of the type, with no room number. */
export async function loadIcalBlocks(admin: Admin, shopId: string): Promise<BookedRoomLite[]> {
  if (!(await hotelOpsReady(admin))) return [];
  const { data } = await loose(admin).from("hotel_ical_blocks").select("id, room_type_id, start_date, end_date").eq("shop_id", shopId).gte("end_date", addDays(todayIso(), -1));
  return (data ?? []).map((b) => ({ bookingId: `ical:${b.id}`, roomTypeId: b.room_type_id, roomId: null, checkIn: b.start_date, checkOut: b.end_date }));
}

/** Reads one site's calendar into its blocks. A failure leaves the blocks it had. */
export async function syncIcalFeed(admin: Admin, shopId: string, id: string): Promise<{ error?: string; count?: number }> {
  const db = loose(admin);
  const { data: feed } = await db.from("hotel_ical_feeds").select("id, room_type_id, url").eq("id", id).eq("shop_id", shopId).maybeSingle();
  if (!feed) return { error: "Calendar not found." };
  const fail = async (message: string) => {
    await db.from("hotel_ical_feeds").update({ last_error: message }).eq("id", id);
    return { error: message };
  };
  if (icalUrlProblem(feed.url)) return fail("That address can't be used.");
  let text: string;
  try {
    // Redirects aren't followed, so a public link can't lead the server to a private address.
    const res = await fetch(feed.url, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { accept: "text/calendar" } });
    if (!res.ok) return fail(`The site answered ${res.status}.`);
    text = (await res.text()).slice(0, 2_000_000);
  } catch {
    return fail("The site didn't answer.");
  }
  if (!text.includes("BEGIN:VCALENDAR")) return fail("That link isn't a calendar.");
  const today = todayIso();
  const seen = new Set<string>();
  const rows = parseIcal(text)
    .filter((e) => e.end >= today && e.end > e.start && !seen.has(e.uid) && seen.add(e.uid))
    .slice(0, 2000)
    .map((e) => ({ shop_id: shopId, feed_id: id, room_type_id: feed.room_type_id, uid: e.uid, start_date: e.start, end_date: e.end, summary: e.summary || null }));
  // Replaced whole: a stay the site has cancelled drops out by not being there any more.
  const { error: clearError } = await db.from("hotel_ical_blocks").delete().eq("feed_id", id);
  if (clearError) return fail("Its dates couldn't be saved.");
  if (rows.length) {
    const { error } = await db.from("hotel_ical_blocks").insert(rows);
    if (error) return fail("Its dates couldn't be saved.");
  }
  await db.from("hotel_ical_feeds").update({ last_synced_at: new Date().toISOString(), last_error: null }).eq("id", id);
  return { count: rows.length };
}

/** Calendars not read in the last hour, read in the background of a front desk visit. */
export async function syncStaleIcalFeeds(admin: Admin, shopId: string): Promise<void> {
  if (!(await hotelOpsReady(admin))) return;
  const before = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data } = await loose(admin).from("hotel_ical_feeds").select("id").eq("shop_id", shopId).or(`last_synced_at.is.null,last_synced_at.lt.${before}`);
  for (const f of data ?? []) await syncIcalFeed(admin, shopId, f.id);
}

// ─── Accounts ──────────────────────────────────────────────────────────────────
export type HotelAccount = {
  id: string;
  kind: "company" | "agent";
  name: string;
  gstin: string | null;
  address: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  discountPercent: number;
  commissionPercent: number;
  creditDays: number | null;
};

export async function loadAccounts(admin: Admin, shopId: string): Promise<HotelAccount[]> {
  if (!(await hotelOpsReady(admin))) return [];
  const { data } = await loose(admin).from("hotel_accounts").select("*").eq("shop_id", shopId).eq("is_active", true).order("name");
  return (data ?? []).map((a) => ({
    id: a.id,
    kind: a.kind,
    name: a.name,
    gstin: a.gstin,
    address: a.address,
    contactPerson: a.contact_person,
    phone: a.phone,
    email: a.email,
    discountPercent: Number(a.discount_percent),
    commissionPercent: Number(a.commission_percent),
    creditDays: a.credit_days,
  }));
}

// ─── Housekeeping and maintenance ──────────────────────────────────────────────
export type HkRoom = { id: string; assignedTo: string | null; stage: string; at: string | null; blockedUntil: string | null };

export async function loadHkDetails(admin: Admin, shopId: string): Promise<HkRoom[]> {
  const { data } = await loose(admin).from("hotel_rooms").select("id, housekeeping, assigned_to, housekeeping_at, blocked_until").eq("shop_id", shopId).eq("is_active", true);
  return (data ?? []).map((r) => ({ id: r.id, assignedTo: r.assigned_to, stage: r.housekeeping, at: r.housekeeping_at, blockedUntil: r.blocked_until }));
}

export type Ticket = {
  id: string;
  roomId: string | null;
  category: string;
  priority: string;
  title: string;
  note: string | null;
  status: string;
  assignedTo: string | null;
  blocksRoom: boolean;
  cost: number | null;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export async function loadTickets(admin: Admin, shopId: string): Promise<Ticket[]> {
  const db = loose(admin);
  const [{ data: open }, { data: closed }] = await Promise.all([
    db.from("hotel_maintenance_tickets").select("*").eq("shop_id", shopId).in("status", ["open", "in_progress"]).order("created_at", { ascending: false }).limit(200),
    db.from("hotel_maintenance_tickets").select("*").eq("shop_id", shopId).in("status", ["done", "cancelled"]).order("resolved_at", { ascending: false }).limit(20),
  ]);
  return [...(open ?? []), ...(closed ?? [])].map((t) => ({
    id: t.id,
    roomId: t.room_id,
    category: t.category,
    priority: t.priority,
    title: t.title,
    note: t.note,
    status: t.status,
    assignedTo: t.assigned_to,
    blocksRoom: !!t.blocks_room,
    cost: t.cost === null ? null : Number(t.cost),
    resolution: t.resolution,
    createdAt: t.created_at,
    resolvedAt: t.resolved_at,
  }));
}

/** New online requests and urgent tickets, for the front desk. */
export async function loadDeskAlerts(admin: Admin, shopId: string): Promise<{ newRequests: number; urgentTickets: number; openTickets: number }> {
  if (!(await hotelOpsReady(admin))) return { newRequests: 0, urgentTickets: 0, openTickets: 0 };
  const db = loose(admin);
  const [{ count: newRequests }, { data: tickets }] = await Promise.all([
    db.from("hotel_booking_requests").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("status", "new"),
    db.from("hotel_maintenance_tickets").select("priority").eq("shop_id", shopId).in("status", ["open", "in_progress"]),
  ]);
  return { newRequests: newRequests ?? 0, urgentTickets: (tickets ?? []).filter((t) => t.priority === "urgent").length, openTickets: tickets?.length ?? 0 };
}

// ─── Flash report ──────────────────────────────────────────────────────────────
type DayReport = {
  summary: { occupancyPercent: number; roomNights: number; availableRoomNights: number; roomRevenue: number; adr: number; revPar: number; commissionTotal: number };
  extrasRevenue: number;
  roomServiceRevenue: number;
  receivedByMethod: Record<string, number>;
  cancelled: number;
  noShows: number;
};

/** The day's figures, from the hotel's report for that one day plus what only this module knows. */
export async function flashFigures(admin: Admin, shopId: string, date: string, report: DayReport, rooms: RoomLite[], booked: BookedRoomLite[]): Promise<FlashFigures> {
  const db = loose(admin);
  const start = new Date(`${date}T00:00:00+05:30`).toISOString();
  const end = new Date(`${date}T23:59:59.999+05:30`).toISOString();
  const tomorrow = addDays(date, 1);
  const [{ data: events }, { data: eventPaid }] = await Promise.all([
    db.from("hotel_events").select("hall_rent, plates, plate_rate, decoration, other_amount, other_label, gst_percent, event_name").eq("shop_id", shopId).eq("event_date", date).in("status", ["confirmed", "completed"]),
    db.from("hotel_event_payments").select("kind, amount, payment_method").eq("shop_id", shopId).gte("created_at", start).lte("created_at", end),
  ]);
  const received = { ...report.receivedByMethod };
  for (const p of eventPaid ?? []) received[p.payment_method] = round2((received[p.payment_method] ?? 0) + (p.kind === "refund" ? -Number(p.amount) : Number(p.amount)));
  const eventRevenue = (events ?? []).reduce((s, e) => s + eventAmounts({ hallRent: Number(e.hall_rent), plates: e.plates, plateRate: Number(e.plate_rate), decoration: Number(e.decoration), otherAmount: Number(e.other_amount), otherLabel: e.other_label, gstPercent: Number(e.gst_percent), eventName: e.event_name }).taxable, 0);
  const occupancy = occupancyByDate({ rooms, booked, from: tomorrow, days: 7 });
  return {
    date,
    occupancyPercent: report.summary.occupancyPercent,
    roomNights: report.summary.roomNights,
    roomsInService: report.summary.availableRoomNights,
    adr: report.summary.adr,
    revPar: report.summary.revPar,
    roomRevenue: report.summary.roomRevenue,
    extrasRevenue: report.extrasRevenue,
    roomServiceRevenue: report.roomServiceRevenue,
    eventRevenue: round2(eventRevenue),
    received,
    cancelled: report.cancelled,
    noShows: report.noShows,
    commission: report.summary.commissionTotal,
    arrivalsTomorrow: new Set(booked.filter((b) => b.checkIn === tomorrow && !b.bookingId.startsWith("ical:")).map((b) => b.bookingId)).size,
    departuresTomorrow: new Set(booked.filter((b) => b.checkOut === tomorrow && !b.bookingId.startsWith("ical:")).map((b) => b.bookingId)).size,
    nextWeekOccupancy: [...occupancy.entries()].map(([d, percent]) => ({ date: d, percent })),
  };
}

export type ClosedAudit = { date: string; figures: FlashFigures; note: string | null; closedAt: string; closedBy: string | null };

export async function loadClosedAudits(admin: Admin, shopId: string): Promise<ClosedAudit[]> {
  const { data } = await loose(admin).from("hotel_night_audits").select("business_date, figures, note, closed_at, closed_by").eq("shop_id", shopId).order("business_date", { ascending: false }).limit(31);
  return (data ?? []).map((a) => ({ date: a.business_date, figures: a.figures as FlashFigures, note: a.note, closedAt: a.closed_at, closedBy: a.closed_by }));
}

export function deskIssues(input: { lateArrivals: number; arrivalsPending: number; overstays: number; departuresPending: number; roomsToClean: number; urgentTickets: number; newRequests: number }): AuditIssue[] {
  return auditIssues(input);
}

// ─── Rate and availability calendar ────────────────────────────────────────────
export type RateGridRow = { typeId: string; name: string; baseRate: number; cells: { date: string; free: number; total: number; rate: number; closed: boolean; minStay: number | null }[] };

export function rateGrid(input: { types: { id: string; name: string; baseRate: number }[]; rooms: RoomLite[]; booked: BookedRoomLite[]; rules: RateRule[]; from: string; days: number }): RateGridRow[] {
  const occupancy = occupancyByDate({ rooms: input.rooms, booked: input.booked, from: input.from, days: input.days });
  const dates = Array.from({ length: input.days }, (_, i) => addDays(input.from, i));
  const byDay = dates.map((date) => availabilityByType({ rooms: input.rooms, booked: input.booked, checkIn: date, checkOut: addDays(date, 1) }));
  return input.types.map((t) => ({
    typeId: t.id,
    name: t.name,
    baseRate: t.baseRate,
    cells: dates.map((date, i) => {
      const q = quoteStay({ baseRate: t.baseRate, typeId: t.id, checkIn: date, checkOut: addDays(date, 1), rules: input.rules, occupancy: (d) => occupancy.get(d) ?? 0 });
      const minStay = Math.max(0, ...input.rules.filter((r) => r.isActive && (!r.roomTypeId || r.roomTypeId === t.id) && (!r.startDate || date >= r.startDate) && (!r.endDate || date <= r.endDate)).map((r) => r.minStay ?? 0));
      return { date, free: byDay[i][t.id]?.available ?? 0, total: byDay[i][t.id]?.total ?? 0, rate: q.average, closed: !!q.closedToArrival, minStay: minStay > 1 ? minStay : null };
    }),
  }));
}

// ─── Form C ────────────────────────────────────────────────────────────────────
export type FormCRow = { id: string; bookingNumber: string; guestName: string; nationality: string; checkIn: string; checkOut: string; status: string; passportNumber: string | null; filedAt: string | null; reference: string | null };

/** Foreign guests staying or due, and those who left in the last 30 days. */
export async function loadFormCGuests(admin: Admin, shopId: string, today: string): Promise<FormCRow[]> {
  const { data } = await loose(admin)
    .from("hotel_bookings")
    .select("id, booking_number, guest_name, nationality, check_in_date, check_out_date, status, passport_number, form_c_filed_at, form_c_reference")
    .eq("shop_id", shopId)
    .not("nationality", "ilike", "indian")
    .in("status", ["reserved", "checked_in", "checked_out"])
    .gte("check_out_date", addDays(today, -30))
    .order("check_in_date", { ascending: false })
    .limit(200);
  return (data ?? []).map((b) => ({ id: b.id, bookingNumber: b.booking_number, guestName: b.guest_name, nationality: b.nationality, checkIn: b.check_in_date, checkOut: b.check_out_date, status: b.status, passportNumber: b.passport_number, filedAt: b.form_c_filed_at, reference: b.form_c_reference }));
}

// ─── Banquet ───────────────────────────────────────────────────────────────────
export type Hall = { id: string; name: string; capacity: number | null; rate: number };
export type EventRow = {
  id: string;
  eventNumber: string;
  hallId: string | null;
  hallName: string | null;
  eventName: string;
  clientName: string;
  clientPhone: string | null;
  companyName: string | null;
  companyGstin: string | null;
  companyAddress: string | null;
  eventDate: string;
  session: "morning" | "evening" | "full_day";
  guests: number;
  hallRent: number;
  plateRate: number;
  plates: number;
  decoration: number;
  otherAmount: number;
  otherLabel: string | null;
  gstPercent: number;
  menu: string | null;
  note: string | null;
  status: "enquiry" | "confirmed" | "completed" | "cancelled";
  billId: string | null;
  received: number;
};

export async function loadHalls(admin: Admin, shopId: string): Promise<Hall[]> {
  const { data } = await loose(admin).from("hotel_halls").select("id, name, capacity, rate").eq("shop_id", shopId).eq("is_active", true).order("name");
  return (data ?? []).map((h) => ({ id: h.id, name: h.name, capacity: h.capacity, rate: Number(h.rate) }));
}

export async function loadEvents(admin: Admin, shopId: string, opts: { from?: string; to?: string; limit?: number } = {}): Promise<EventRow[]> {
  const db = loose(admin);
  let q = db.from("hotel_events").select("*").eq("shop_id", shopId);
  if (opts.from) q = q.gte("event_date", opts.from);
  if (opts.to) q = q.lte("event_date", opts.to);
  const [{ data: rows }, halls] = await Promise.all([q.order("event_date").limit(opts.limit ?? 200), loadHalls(admin, shopId)]);
  const ids = (rows ?? []).map((e) => e.id);
  const { data: paid } = ids.length ? await db.from("hotel_event_payments").select("event_id, kind, amount").in("event_id", ids) : { data: [] };
  const received = new Map<string, number>();
  for (const p of paid ?? []) received.set(p.event_id, round2((received.get(p.event_id) ?? 0) + (p.kind === "refund" ? -Number(p.amount) : Number(p.amount))));
  const hallName = new Map(halls.map((h) => [h.id, h.name]));
  return (rows ?? []).map((e) => ({
    id: e.id,
    eventNumber: e.event_number,
    hallId: e.hall_id,
    hallName: e.hall_id ? hallName.get(e.hall_id) ?? null : null,
    eventName: e.event_name,
    clientName: e.client_name,
    clientPhone: e.client_phone,
    companyName: e.company_name,
    companyGstin: e.company_gstin,
    companyAddress: e.company_address,
    eventDate: e.event_date,
    session: e.session,
    guests: e.guests,
    hallRent: Number(e.hall_rent),
    plateRate: Number(e.plate_rate),
    plates: e.plates,
    decoration: Number(e.decoration),
    otherAmount: Number(e.other_amount),
    otherLabel: e.other_label,
    gstPercent: Number(e.gst_percent),
    menu: e.menu,
    note: e.note,
    status: e.status,
    billId: e.bill_id,
    received: received.get(e.id) ?? 0,
  }));
}

// ─── More reports ──────────────────────────────────────────────────────────────
export type OpsReport = {
  byType: { name: string; rooms: number; roomNights: number; revenue: number; adr: number; occupancyPercent: number }[];
  forecast: { label: string; days: number; roomNights: number; revenue: number; occupancyPercent: number }[];
  byAccount: { name: string; kind: string; bookings: number; roomNights: number; revenue: number }[];
  events: { count: number; taxable: number; received: number };
  cleaned: { name: string; rooms: number }[];
  tickets: { opened: number; closed: number; cost: number };
};

/** The hotel's reports beyond occupancy and source: how each room type earns, what is already on the
 * books, which companies and agents bring business, events, and the housekeeping and repair work. */
export async function loadOpsReport(admin: Admin, shopId: string, from: string, to: string, today: string, opsTables: boolean): Promise<OpsReport> {
  const startTs = new Date(`${from}T00:00:00+05:30`).toISOString();
  const endTs = new Date(`${to}T23:59:59.999+05:30`).toISOString();
  const db = loose(admin);
  const [{ data: types }, { data: rooms }, { data: stays }] = await Promise.all([
    admin.from("hotel_room_types").select("id, name").eq("shop_id", shopId),
    admin.from("hotel_rooms").select("id, room_type_id, is_blocked").eq("shop_id", shopId).eq("is_active", true),
    allRows<{ booking_id: string; room_type_id: string; rate_per_night: number; hotel_bookings: unknown }>((a, b) =>
      db
        .from("hotel_booking_rooms")
        .select(`booking_id, room_type_id, rate_per_night, hotel_bookings!inner ( id, status, check_in_date, check_out_date${opsTables ? ", account_id" : ""} )`)
        .eq("shop_id", shopId)
        .in("hotel_bookings.status", ["reserved", "checked_in", "checked_out"])
        .lte("hotel_bookings.check_in_date", addDays(today, 90))
        .gte("hotel_bookings.check_out_date", from)
        .order("id")
        .range(a, b) as never,
    ),
  ]);
  const stayRows = ((stays ?? []) as { booking_id: string; room_type_id: string; rate_per_night: number; hotel_bookings: unknown }[]).map((r) => {
    const b = (Array.isArray(r.hotel_bookings) ? r.hotel_bookings[0] : r.hotel_bookings) as { id: string; status: string; check_in_date: string; check_out_date: string; account_id?: string | null };
    return { bookingId: r.booking_id, typeId: r.room_type_id, rate: Number(r.rate_per_night), status: b.status, checkIn: b.check_in_date, checkOut: b.check_out_date, accountId: b.account_id ?? null };
  });
  const within = (s: { checkIn: string; checkOut: string }, a: string, b: string) => nightDates(s.checkIn, s.checkOut).filter((d) => d >= a && d <= b).length;
  const periodDays = nightsBetween(from, to) + 1;
  const inService = (rooms ?? []).filter((r) => !r.is_blocked);

  const byType = (types ?? [])
    .map((t) => {
      const mine = stayRows.filter((s) => s.typeId === t.id && s.status !== "reserved");
      const roomNights = mine.reduce((sum, s) => sum + within(s, from, to), 0);
      const revenue = round2(mine.reduce((sum, s) => sum + within(s, from, to) * s.rate, 0));
      const count = inService.filter((r) => r.room_type_id === t.id).length;
      return { name: t.name, rooms: count, roomNights, revenue, adr: roomNights ? Math.round(revenue / roomNights) : 0, occupancyPercent: count ? Math.min(100, Math.round((roomNights / (count * periodDays)) * 100)) : 0 };
    })
    .filter((t) => t.rooms > 0 || t.roomNights > 0);

  const forecast = [7, 30, 90].map((days) => {
    const last = addDays(today, days - 1);
    const mine = stayRows.filter((s) => s.status !== "checked_out");
    const roomNights = mine.reduce((sum, s) => sum + within(s, today, last), 0);
    return { label: `${days}`, days, roomNights, revenue: round2(mine.reduce((sum, s) => sum + within(s, today, last) * s.rate, 0)), occupancyPercent: inService.length ? Math.min(100, Math.round((roomNights / (inService.length * days)) * 100)) : 0 };
  });

  const empty: OpsReport = { byType, forecast, byAccount: [], events: { count: 0, taxable: 0, received: 0 }, cleaned: [], tickets: { opened: 0, closed: 0, cost: 0 } };
  if (!opsTables) return empty;

  const [accounts, events, { data: eventPaid }, { data: hkLog }, { data: opened }, { data: closed }, { data: staff }] = await Promise.all([
    loadAccounts(admin, shopId),
    loadEvents(admin, shopId, { from, to, limit: 1000 }),
    db.from("hotel_event_payments").select("kind, amount").eq("shop_id", shopId).gte("created_at", startTs).lte("created_at", endTs),
    db.from("hotel_housekeeping_log").select("staff_id").eq("shop_id", shopId).eq("to_state", "clean").gte("created_at", startTs).lte("created_at", endTs).limit(5000),
    db.from("hotel_maintenance_tickets").select("id").eq("shop_id", shopId).gte("created_at", startTs).lte("created_at", endTs),
    db.from("hotel_maintenance_tickets").select("cost").eq("shop_id", shopId).eq("status", "done").gte("resolved_at", startTs).lte("resolved_at", endTs),
    admin.from("staff").select("id, name").eq("shop_id", shopId),
  ]);

  const byAccount = accounts
    .map((a) => {
      const mine = stayRows.filter((s) => s.accountId === a.id && s.status !== "reserved");
      const roomNights = mine.reduce((sum, s) => sum + within(s, from, to), 0);
      return { name: a.name, kind: a.kind, bookings: new Set(mine.filter((s) => within(s, from, to) > 0).map((s) => s.bookingId)).size, roomNights, revenue: round2(mine.reduce((sum, s) => sum + within(s, from, to) * s.rate, 0)) };
    })
    .filter((a) => a.roomNights > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const live = events.filter((e) => e.status === "confirmed" || e.status === "completed");
  const staffName = new Map((staff ?? []).map((s) => [s.id, s.name]));
  const cleanCount = new Map<string, number>();
  for (const l of hkLog ?? []) {
    const name = (l.staff_id && staffName.get(l.staff_id)) || "Not recorded";
    cleanCount.set(name, (cleanCount.get(name) ?? 0) + 1);
  }
  return {
    ...empty,
    byAccount,
    events: {
      count: live.length,
      taxable: round2(live.reduce((s, e) => s + eventAmounts({ ...e, eventName: e.eventName }).taxable, 0)),
      received: round2((eventPaid ?? []).reduce((s, p) => s + (p.kind === "refund" ? -Number(p.amount) : Number(p.amount)), 0)),
    },
    cleaned: [...cleanCount.entries()].map(([name, count]) => ({ name, rooms: count })).sort((a, b) => b.rooms - a.rooms),
    tickets: { opened: opened?.length ?? 0, closed: closed?.length ?? 0, cost: round2((closed ?? []).reduce((s, c) => s + Number(c.cost ?? 0), 0)) },
  };
}
