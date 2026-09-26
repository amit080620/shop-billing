"use server";

import { revalidatePath } from "next/cache";
import { requireSession, hasPermission, type SessionContext } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { calculateTransactionTotals } from "../validation/schemas";
import { financialYearFor, round2 } from "../gst";
import { todayIso } from "../dateHelpers";
import { normalizePhone } from "../phone";
import { logAuditEvent } from "../audit";
import { billLimitError } from "../planLimits";
import { findOrCreateCustomerByPhone } from "./customers";
import { applyOrderDiscountAction, settleOrderAction } from "./restaurant";
import { isIsoDate, nightsBetween } from "../hotel/dates";
import { availabilityByType, freeRooms } from "../hotel/availability";
import { ACCOMMODATION_SAC, BOOKING_SOURCE_VALUES, MEAL_PLANS, PAYMENT_METHODS, sourceTakesCommission, type MealPlan, type PaymentMethod } from "../hotel/constants";
import { allocateUnpaid, computeFolio, toFolioRooms, type FolioInvoiceItem } from "../hotel/folio";
import { roomGstPercent, accommodationGstPercent } from "../hotel/gst";
import { parseRoomNumbers } from "../hotel/roomNumbers";
import { hotelSchemaReady, loadActiveBookedRooms, loadBookingDetail, loadInventory, toRoomLite, currentGuestForRoom, type Admin } from "../hotel/server";

export type HotelResult = { error?: string };

const NOT_READY = "The hotel tables haven't been created yet — run migration 0041_hotel.sql in Supabase, then try again.";
const MAX_STAY_NIGHTS = 90;

async function open(): Promise<{ session: SessionContext; admin: Admin } | { error: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  if (!(await hotelSchemaReady(admin))) return { error: NOT_READY };
  return { session, admin };
}

function isManager(session: SessionContext) {
  return session.role === "owner" || session.role === "manager";
}

function refreshHotel(bookingId?: string) {
  for (const path of ["/hotel", "/hotel/rooms", "/hotel/bookings", "/hotel/calendar", "/hotel/reports", "/dashboard"]) revalidatePath(path);
  if (bookingId) revalidatePath(`/hotel/bookings/${bookingId}`);
}

function money(n: unknown): number | null {
  const v = Number(n);
  return Number.isFinite(v) ? round2(v) : null;
}

function validPayment(p: { method: string; amount: number }): string | null {
  if (!PAYMENT_METHODS.includes(p.method as PaymentMethod)) return "Choose how the payment was made";
  if (!Number.isFinite(p.amount) || p.amount <= 0) return "Each payment amount must be more than 0";
  return null;
}

// ─── Set-up: room types and rooms ──────────────────────────────────────

export async function saveRoomTypeAction(input: {
  id?: string;
  name: string;
  description?: string;
  baseRate: number;
  maxAdults: number;
  maxChildren: number;
  amenities?: string;
  /** Leave empty to use the standard GST slab for the tariff. */
  gstPercent?: number | null;
}): Promise<HotelResult & { id?: string }> {
  const ctx = await open();
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  if (!isManager(session)) return { error: "Only the owner or a manager can change room types." };

  const name = input.name.trim();
  if (!name) return { error: "Give the room type a name, like Deluxe AC" };
  if (name.length > 60) return { error: "That name is too long" };
  const baseRate = money(input.baseRate);
  if (baseRate === null || baseRate < 0) return { error: "Enter the rate for one night" };
  const maxAdults = Math.floor(Number(input.maxAdults));
  const maxChildren = Math.floor(Number(input.maxChildren));
  if (!(maxAdults >= 1 && maxAdults <= 20)) return { error: "Adults per room must be between 1 and 20" };
  if (!(maxChildren >= 0 && maxChildren <= 20)) return { error: "Children per room must be between 0 and 20" };
  const gst = input.gstPercent == null || (input.gstPercent as unknown) === "" ? null : Number(input.gstPercent);
  if (gst !== null && (!Number.isFinite(gst) || gst < 0 || gst > 40)) return { error: "GST % must be between 0 and 40" };

  const row = {
    name,
    description: input.description?.trim() || null,
    base_rate: baseRate,
    max_adults: maxAdults,
    max_children: maxChildren,
    amenities: input.amenities?.trim() || null,
    gst_percent: gst,
  };
  if (input.id) {
    const { error } = await admin.from("hotel_room_types").update(row).eq("id", input.id).eq("shop_id", session.shopId);
    if (error) return { error: "Could not save the room type" };
    refreshHotel();
    revalidatePath("/hotel/setup");
    return { id: input.id };
  }
  const { data, error } = await admin.from("hotel_room_types").insert({ ...row, shop_id: session.shopId }).select("id").single();
  if (error || !data) return { error: "Could not add the room type" };
  refreshHotel();
  revalidatePath("/hotel/setup");
  return { id: data.id };
}

export async function archiveRoomTypeAction(id: string): Promise<HotelResult> {
  const ctx = await open();
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  if (!isManager(session)) return { error: "Only the owner or a manager can change room types." };
  const { count } = await admin
    .from("hotel_rooms")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", session.shopId)
    .eq("room_type_id", id)
    .eq("is_active", true);
  if ((count ?? 0) > 0) return { error: "Remove this type's rooms first (or move them to another type)." };
  const { error } = await admin.from("hotel_room_types").update({ is_active: false }).eq("id", id).eq("shop_id", session.shopId);
  if (error) return { error: "Could not remove the room type" };
  revalidatePath("/hotel/setup");
  return {};
}

/** Each room gets its own table in the restaurant, so room service runs
 * through the normal order → kitchen → serve flow and can be charged to the room. */
async function ensureRoomTable(admin: Admin, shopId: string, roomId: string, roomNumber: string) {
  const { data: existing } = await admin.from("restaurant_tables").select("id").eq("shop_id", shopId).eq("hotel_room_id", roomId).limit(1);
  if (existing?.length) {
    await admin.from("restaurant_tables").update({ name: `Room ${roomNumber}`, is_deleted: false }).eq("id", existing[0].id);
    return;
  }
  await admin.from("restaurant_tables").insert({ shop_id: shopId, name: `Room ${roomNumber}`, section: "inside", hotel_room_id: roomId });
}

export async function addRoomsAction(input: { roomTypeId: string; numbers: string; floor?: string }): Promise<HotelResult & { added?: number; skipped?: string[] }> {
  const ctx = await open();
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  if (!isManager(session)) return { error: "Only the owner or a manager can add rooms." };

  const parsed = parseRoomNumbers(input.numbers);
  if (parsed.error) return { error: parsed.error };
  const { data: type } = await admin.from("hotel_room_types").select("id").eq("id", input.roomTypeId).eq("shop_id", session.shopId).eq("is_active", true).maybeSingle();
  if (!type) return { error: "Choose a room type first" };

  const { data: existing } = await admin.from("hotel_rooms").select("room_number").eq("shop_id", session.shopId).eq("is_active", true);
  const have = new Set((existing ?? []).map((r) => r.room_number));
  const toAdd = parsed.numbers.filter((n) => !have.has(n));
  const skipped = parsed.numbers.filter((n) => have.has(n));
  if (toAdd.length === 0) return { error: `Room ${skipped.join(", ")} already exist${skipped.length === 1 ? "s" : ""}`, skipped };

  const { data: created, error } = await admin
    .from("hotel_rooms")
    .insert(toAdd.map((room_number) => ({ shop_id: session.shopId, room_type_id: type.id, room_number, floor: input.floor?.trim() || null })))
    .select("id, room_number");
  if (error || !created) return { error: "Could not add the rooms" };

  await Promise.all(created.map((r) => ensureRoomTable(admin, session.shopId, r.id, r.room_number)));
  refreshHotel();
  revalidatePath("/hotel/setup");
  revalidatePath("/restaurant");
  return { added: created.length, skipped };
}

export async function updateRoomAction(input: { id: string; roomNumber: string; floor?: string; roomTypeId: string }): Promise<HotelResult> {
  const ctx = await open();
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  if (!isManager(session)) return { error: "Only the owner or a manager can change rooms." };
  const number = input.roomNumber.trim();
  if (!number || number.length > 20) return { error: "Enter a room number" };
  const { data: clash } = await admin.from("hotel_rooms").select("id").eq("shop_id", session.shopId).eq("is_active", true).eq("room_number", number).neq("id", input.id).limit(1);
  if (clash?.length) return { error: `Room ${number} already exists` };
  const { data: type } = await admin.from("hotel_room_types").select("id").eq("id", input.roomTypeId).eq("shop_id", session.shopId).maybeSingle();
  if (!type) return { error: "Choose a room type" };
  const { error } = await admin
    .from("hotel_rooms")
    .update({ room_number: number, floor: input.floor?.trim() || null, room_type_id: input.roomTypeId })
    .eq("id", input.id)
    .eq("shop_id", session.shopId);
  if (error) return { error: "Could not save the room" };
  await ensureRoomTable(admin, session.shopId, input.id, number);
  refreshHotel();
  revalidatePath("/hotel/setup");
  return {};
}

export async function archiveRoomAction(id: string): Promise<HotelResult> {
  const ctx = await open();
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  if (!isManager(session)) return { error: "Only the owner or a manager can remove rooms." };
  const booked = await loadActiveBookedRooms(admin, session.shopId);
  if (booked.some((b) => b.roomId === id)) return { error: "This room is on an upcoming or in-house booking — move that booking first." };
  const { error } = await admin.from("hotel_rooms").update({ is_active: false }).eq("id", id).eq("shop_id", session.shopId);
  if (error) return { error: "Could not remove the room" };
  await admin.from("restaurant_tables").update({ is_deleted: true }).eq("shop_id", session.shopId).eq("hotel_room_id", id);
  refreshHotel();
  revalidatePath("/hotel/setup");
  revalidatePath("/restaurant");
  return {};
}

/** Housekeeping and out-of-service: any staff member can mark a room clean
 * or dirty; only a manager can take one out of service. */
export async function setRoomStateAction(input: { roomId: string; housekeeping?: "clean" | "dirty"; blocked?: boolean; reason?: string }): Promise<HotelResult> {
  const ctx = await open();
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const patch: { housekeeping?: "clean" | "dirty"; is_blocked?: boolean; block_reason?: string | null } = {};
  if (input.housekeeping) patch.housekeeping = input.housekeeping;
  if (input.blocked !== undefined) {
    if (!isManager(session)) return { error: "Only the owner or a manager can take a room out of service." };
    if (input.blocked) {
      const guest = await currentGuestForRoom(admin, session.shopId, input.roomId);
      if (guest) return { error: `${guest.guestName} is staying in this room — check them out first.` };
    }
    patch.is_blocked = input.blocked;
    patch.block_reason = input.blocked ? input.reason?.trim() || "Maintenance" : null;
  }
  if (Object.keys(patch).length === 0) return {};
  const { error } = await admin.from("hotel_rooms").update(patch).eq("id", input.roomId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not update the room" };
  refreshHotel();
  return {};
}

// ─── Availability ──────────────────────────────────────────────────────

export async function getAvailabilityAction(input: { checkIn: string; checkOut: string; excludeBookingId?: string }) {
  const ctx = await open();
  if ("error" in ctx) return { error: ctx.error };
  const { session, admin } = ctx;
  if (!isIsoDate(input.checkIn) || !isIsoDate(input.checkOut) || input.checkOut <= input.checkIn) return { error: "Check-out must be after check-in" };
  const [{ types, rooms }, booked] = await Promise.all([loadInventory(admin, session.shopId), loadActiveBookedRooms(admin, session.shopId)]);
  const byType = availabilityByType({ rooms: toRoomLite(rooms), booked, checkIn: input.checkIn, checkOut: input.checkOut, excludeBookingId: input.excludeBookingId });
  const free = freeRooms({ rooms: toRoomLite(rooms), booked, checkIn: input.checkIn, checkOut: input.checkOut, excludeBookingId: input.excludeBookingId });
  const freeByType: Record<string, { id: string; roomNumber: string }[]> = {};
  const numberById = new Map(rooms.map((r) => [r.id, r.roomNumber]));
  for (const r of free) (freeByType[r.roomTypeId] ??= []).push({ id: r.id, roomNumber: numberById.get(r.id) ?? "" });
  return {
    types: types.map((t) => ({ id: t.id, name: t.name, baseRate: t.baseRate, gstPercent: t.gstPercent, maxAdults: t.maxAdults, available: byType[t.id]?.available ?? 0, total: byType[t.id]?.total ?? 0, freeRooms: freeByType[t.id] ?? [] })),
  };
}

// ─── Bookings ──────────────────────────────────────────────────────────

export type NewBookingInput = {
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  nationality?: string;
  adults: number;
  children: number;
  source: string;
  sourceRef?: string;
  agentName?: string;
  commissionPercent?: number;
  mealPlan: MealPlan;
  checkIn: string;
  checkOut: string;
  specialRequests?: string;
  rooms: { roomTypeId: string; roomId?: string | null; ratePerNight: number }[];
  advanceAmount?: number;
  advanceMethod?: PaymentMethod;
  advanceReference?: string;
};

async function resolveCustomer(admin: Admin, shopId: string, name: string, phone: string | undefined): Promise<{ id: string | null; error?: string }> {
  if (!phone?.trim()) return { id: null };
  const digits = normalizePhone(phone);
  if (digits.length < 7 || digits.length > 15) return { id: null, error: "Enter the guest's mobile number correctly (10 digits)" };
  const customer = await findOrCreateCustomerByPhone(admin, shopId, digits, name);
  return { id: customer?.id ?? null };
}

export async function createBookingAction(input: NewBookingInput): Promise<HotelResult & { bookingId?: string }> {
  const ctx = await open();
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;

  const guestName = input.guestName.trim();
  if (!guestName) return { error: "Enter the guest's name" };
  if (guestName.length > 120) return { error: "That guest name is too long" };
  if (!isIsoDate(input.checkIn) || !isIsoDate(input.checkOut)) return { error: "Choose the check-in and check-out dates" };
  if (input.checkOut <= input.checkIn) return { error: "Check-out must be after check-in" };
  if (input.checkIn < todayIso()) return { error: "The arrival date is in the past" };
  const nights = nightsBetween(input.checkIn, input.checkOut);
  if (nights > MAX_STAY_NIGHTS) return { error: `A stay can be at most ${MAX_STAY_NIGHTS} nights — make a second booking for longer.` };
  const adults = Math.floor(Number(input.adults));
  const children = Math.floor(Number(input.children));
  if (!(adults >= 1 && adults <= 60)) return { error: "Enter how many adults are staying" };
  if (!(children >= 0 && children <= 60)) return { error: "Enter how many children are staying" };
  if (!BOOKING_SOURCE_VALUES.includes(input.source as never)) return { error: "Choose where this booking came from" };
  if (!MEAL_PLANS.some((m) => m.value === input.mealPlan)) return { error: "Choose a meal plan" };
  if (input.rooms.length < 1 || input.rooms.length > 20) return { error: "Add between 1 and 20 rooms" };

  const commission = sourceTakesCommission(input.source) ? Number(input.commissionPercent ?? 0) : 0;
  if (!Number.isFinite(commission) || commission < 0 || commission > 100) return { error: "Commission must be between 0% and 100%" };

  const rates = input.rooms.map((r) => money(r.ratePerNight));
  if (rates.some((r) => r === null || r < 0)) return { error: "Enter the rate for every room" };
  const assigned = input.rooms.map((r) => r.roomId).filter(Boolean) as string[];
  if (new Set(assigned).size !== assigned.length) return { error: "The same room can't be picked twice" };

  const advance = input.advanceAmount ? money(input.advanceAmount) : 0;
  if (advance === null || advance < 0) return { error: "Enter the advance amount correctly" };
  if (advance > 0 && !PAYMENT_METHODS.includes((input.advanceMethod ?? "cash") as PaymentMethod)) return { error: "Choose how the advance was paid" };

  const [{ types, rooms }, booked] = await Promise.all([loadInventory(admin, session.shopId), loadActiveBookedRooms(admin, session.shopId)]);
  const typeIds = new Set(types.map((t) => t.id));
  if (input.rooms.some((r) => !typeIds.has(r.roomTypeId))) return { error: "One of the room types no longer exists" };

  const available = availabilityByType({ rooms: toRoomLite(rooms), booked, checkIn: input.checkIn, checkOut: input.checkOut });
  const asked = new Map<string, number>();
  for (const r of input.rooms) asked.set(r.roomTypeId, (asked.get(r.roomTypeId) ?? 0) + 1);
  for (const [typeId, count] of asked) {
    const a = available[typeId]?.available ?? 0;
    if (count > a) {
      const name = types.find((t) => t.id === typeId)?.name ?? "That room type";
      return { error: a === 0 ? `No ${name} rooms are free for those dates.` : `Only ${a} ${name} room${a === 1 ? " is" : "s are"} free for those dates.` };
    }
  }
  const free = new Set(freeRooms({ rooms: toRoomLite(rooms), booked, checkIn: input.checkIn, checkOut: input.checkOut }).map((r) => r.id));
  for (const r of input.rooms) {
    if (!r.roomId) continue;
    const room = rooms.find((x) => x.id === r.roomId);
    if (!room || room.roomTypeId !== r.roomTypeId) return { error: "That room isn't of the chosen type" };
    if (!free.has(r.roomId)) return { error: `Room ${room.roomNumber} is not free for those dates.` };
  }

  const customer = await resolveCustomer(admin, session.shopId, guestName, input.guestPhone);
  if (customer.error) return { error: customer.error };

  const financialYear = financialYearFor(new Date());
  const { data: issued, error: numberError } = await admin.rpc("next_hotel_booking_number", { p_shop_id: session.shopId, p_financial_year: financialYear });
  if (numberError || issued == null) return { error: "Could not create a booking number. Please try again." };
  const bookingNumber = `${financialYear}/BK${String(issued).padStart(4, "0")}`;

  const { data: booking, error } = await admin
    .from("hotel_bookings")
    .insert({
      shop_id: session.shopId,
      booking_number: bookingNumber,
      financial_year: financialYear,
      customer_id: customer.id,
      guest_name: guestName,
      guest_phone: input.guestPhone?.trim() ? normalizePhone(input.guestPhone) : null,
      guest_email: input.guestEmail?.trim() || null,
      nationality: input.nationality?.trim() || "Indian",
      adults,
      children,
      source: input.source,
      source_ref: input.sourceRef?.trim() || null,
      agent_name: input.agentName?.trim() || null,
      commission_percent: commission,
      meal_plan: input.mealPlan,
      check_in_date: input.checkIn,
      check_out_date: input.checkOut,
      special_requests: input.specialRequests?.trim() || null,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (error || !booking) return { error: "Could not save the booking" };

  const { error: roomsError } = await admin.from("hotel_booking_rooms").insert(
    input.rooms.map((r, i) => ({ booking_id: booking.id, shop_id: session.shopId, room_type_id: r.roomTypeId, room_id: r.roomId || null, rate_per_night: rates[i] as number })),
  );
  if (roomsError) {
    await admin.from("hotel_bookings").delete().eq("id", booking.id);
    return { error: "Could not save the booking's rooms" };
  }

  if (advance > 0) {
    await admin.from("hotel_payments").insert({
      booking_id: booking.id,
      shop_id: session.shopId,
      kind: "advance",
      amount: advance,
      payment_method: input.advanceMethod ?? "cash",
      reference: input.advanceReference?.trim() || null,
      created_by: session.userId,
    });
  }

  await logAuditEvent({ admin, shopId: session.shopId, staffId: session.userId, action: "hotel_booking_created", entityType: "hotel_booking", entityId: booking.id, details: { bookingNumber, source: input.source } });
  refreshHotel(booking.id);
  return { bookingId: booking.id };
}

export async function updateGuestAction(input: {
  bookingId: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  nationality?: string;
  adults: number;
  children: number;
  source: string;
  sourceRef?: string;
  agentName?: string;
  commissionPercent?: number;
  mealPlan: MealPlan;
  specialRequests?: string;
}): Promise<HotelResult> {
  const ctx = await open();
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const name = input.guestName.trim();
  if (!name) return { error: "Enter the guest's name" };
  if (!BOOKING_SOURCE_VALUES.includes(input.source as never)) return { error: "Choose where this booking came from" };
  const commission = sourceTakesCommission(input.source) ? Number(input.commissionPercent ?? 0) : 0;
  if (!Number.isFinite(commission) || commission < 0 || commission > 100) return { error: "Commission must be between 0% and 100%" };
  const adults = Math.floor(Number(input.adults));
  const children = Math.floor(Number(input.children));
  if (!(adults >= 1) || !(children >= 0)) return { error: "Check the number of guests" };

  const { data: booking } = await admin.from("hotel_bookings").select("id, status, customer_id").eq("id", input.bookingId).eq("shop_id", session.shopId).maybeSingle();
  if (!booking) return { error: "Booking not found" };
  if (booking.status === "checked_out" || booking.status === "cancelled" || booking.status === "no_show") return { error: "This booking is closed." };

  let customerId = booking.customer_id;
  if (input.guestPhone?.trim()) {
    const c = await resolveCustomer(admin, session.shopId, name, input.guestPhone);
    if (c.error) return { error: c.error };
    customerId = c.id ?? customerId;
  }
  const { error } = await admin
    .from("hotel_bookings")
    .update({
      guest_name: name,
      guest_phone: input.guestPhone?.trim() ? normalizePhone(input.guestPhone) : null,
      guest_email: input.guestEmail?.trim() || null,
      nationality: input.nationality?.trim() || "Indian",
      adults,
      children,
      source: input.source,
      source_ref: input.sourceRef?.trim() || null,
      agent_name: input.agentName?.trim() || null,
      commission_percent: commission,
      meal_plan: input.mealPlan,
      special_requests: input.specialRequests?.trim() || null,
      customer_id: customerId,
    })
    .eq("id", input.bookingId);
  if (error) return { error: "Could not save the changes" };
  refreshHotel(input.bookingId);
  return {};
}

/** Extend or shorten a stay. An in-house guest's arrival date can't move. */
export async function changeStayDatesAction(input: { bookingId: string; checkIn: string; checkOut: string }): Promise<HotelResult> {
  const ctx = await open();
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  if (!isIsoDate(input.checkIn) || !isIsoDate(input.checkOut) || input.checkOut <= input.checkIn) return { error: "Check-out must be after check-in" };
  if (nightsBetween(input.checkIn, input.checkOut) > MAX_STAY_NIGHTS) return { error: `A stay can be at most ${MAX_STAY_NIGHTS} nights.` };

  const detail = await loadBookingDetail(admin, session.shopId, input.bookingId);
  if (!detail) return { error: "Booking not found" };
  if (detail.status !== "reserved" && detail.status !== "checked_in") return { error: "This booking is closed." };
  if (detail.status === "checked_in" && input.checkIn !== detail.checkIn) return { error: "The guest has already arrived — only the check-out date can change." };
  if (detail.status === "reserved" && input.checkIn < todayIso()) return { error: "The arrival date is in the past" };

  const [{ rooms }, booked] = await Promise.all([loadInventory(admin, session.shopId), loadActiveBookedRooms(admin, session.shopId)]);
  const roomsLite = toRoomLite(rooms);
  const avail = availabilityByType({ rooms: roomsLite, booked, checkIn: input.checkIn, checkOut: input.checkOut, excludeBookingId: input.bookingId });
  const need = new Map<string, number>();
  for (const r of detail.rooms) need.set(r.roomTypeId, (need.get(r.roomTypeId) ?? 0) + 1);
  for (const [typeId, count] of need) {
    if (count > (avail[typeId]?.available ?? 0)) return { error: "There aren't enough free rooms for those dates — this room type is booked." };
  }
  const free = new Set(freeRooms({ rooms: roomsLite, booked, checkIn: input.checkIn, checkOut: input.checkOut, excludeBookingId: input.bookingId }).map((r) => r.id));
  for (const r of detail.rooms) {
    if (r.roomId && !free.has(r.roomId)) return { error: `Room ${r.roomNumber ?? ""} is booked by someone else on those dates.` };
  }

  const { error } = await admin.from("hotel_bookings").update({ check_in_date: input.checkIn, check_out_date: input.checkOut }).eq("id", input.bookingId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not change the dates" };
  refreshHotel(input.bookingId);
  return {};
}

export async function setRoomRateAction(input: { bookingRoomId: string; ratePerNight: number }): Promise<HotelResult> {
  const ctx = await open();
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  if (!isManager(session) && !hasPermission(session, "give_discounts")) return { error: "You don't have permission to change rates." };
  const rate = money(input.ratePerNight);
  if (rate === null || rate < 0) return { error: "Enter the rate for one night" };
  const { data: br } = await admin.from("hotel_booking_rooms").select("id, booking_id").eq("id", input.bookingRoomId).eq("shop_id", session.shopId).maybeSingle();
  if (!br) return { error: "Room not found" };
  const { data: booking } = await admin.from("hotel_bookings").select("status").eq("id", br.booking_id).maybeSingle();
  if (!booking || booking.status === "checked_out" || booking.status === "cancelled" || booking.status === "no_show") return { error: "This booking is closed." };
  const { error } = await admin.from("hotel_booking_rooms").update({ rate_per_night: rate }).eq("id", br.id);
  if (error) return { error: "Could not change the rate" };
  refreshHotel(br.booking_id);
  return {};
}

/** Put a specific room against a booked room (or take the assignment off). */
export async function assignRoomAction(input: { bookingRoomId: string; roomId: string | null }): Promise<HotelResult> {
  const ctx = await open();
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const { data: br } = await admin.from("hotel_booking_rooms").select("id, booking_id, room_type_id").eq("id", input.bookingRoomId).eq("shop_id", session.shopId).maybeSingle();
  if (!br) return { error: "Room not found" };
  const detail = await loadBookingDetail(admin, session.shopId, br.booking_id);
  if (!detail || (detail.status !== "reserved" && detail.status !== "checked_in")) return { error: "This booking is closed." };

  if (input.roomId) {
    const [{ rooms }, booked] = await Promise.all([loadInventory(admin, session.shopId), loadActiveBookedRooms(admin, session.shopId)]);
    const room = rooms.find((r) => r.id === input.roomId);
    if (!room) return { error: "That room doesn't exist" };
    const ok = freeRooms({ rooms: toRoomLite(rooms), booked, checkIn: detail.checkIn, checkOut: detail.checkOut, excludeBookingId: detail.id }).some((r) => r.id === input.roomId);
    if (!ok) return { error: `Room ${room.roomNumber} isn't free for these dates.` };
    // An in-house guest overstaying past their date still holds the room.
    const current = await currentGuestForRoom(admin, session.shopId, room.id);
    if (current && current.bookingId !== detail.id) return { error: `${current.guestName} is still in Room ${room.roomNumber}.` };
    const { error } = await admin.from("hotel_booking_rooms").update({ room_id: room.id, room_type_id: room.roomTypeId }).eq("id", br.id);
    if (error) return { error: "Could not assign the room" };
  } else {
    if (detail.status === "checked_in") return { error: "A guest who has checked in needs a room." };
    const { error } = await admin.from("hotel_booking_rooms").update({ room_id: null }).eq("id", br.id);
    if (error) return { error: "Could not change the room" };
  }
  refreshHotel(br.booking_id);
  return {};
}

export async function checkInAction(input: {
  bookingId: string;
  idProofType?: string;
  idProofNumber?: string;
  assignments?: { bookingRoomId: string; roomId: string }[];
  /** Check in even though housekeeping hasn't marked the room clean. */
  allowDirty?: boolean;
}): Promise<HotelResult> {
  const ctx = await open();
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;

  for (const a of input.assignments ?? []) {
    const r = await assignRoomAction({ bookingRoomId: a.bookingRoomId, roomId: a.roomId });
    if (r.error) return r;
  }

  const detail = await loadBookingDetail(admin, session.shopId, input.bookingId);
  if (!detail) return { error: "Booking not found" };
  if (detail.status !== "reserved") return { error: detail.status === "checked_in" ? "This guest is already checked in." : "This booking can't be checked in." };
  if (detail.checkIn > todayIso()) return { error: `This booking starts on ${detail.checkIn} — change its dates first if the guest has arrived early.` };
  const unassigned = detail.rooms.filter((r) => !r.roomId);
  if (unassigned.length) return { error: `Choose a room for the ${unassigned[0].roomTypeName} first.` };
  const dirty = detail.rooms.find((r) => r.housekeeping === "dirty");
  if (dirty && !input.allowDirty) return { error: `Room ${dirty.roomNumber} hasn't been cleaned yet. Mark it clean, or check in anyway.` };

  for (const r of detail.rooms) {
    const current = r.roomId ? await currentGuestForRoom(admin, session.shopId, r.roomId) : null;
    if (current && current.bookingId !== detail.id) return { error: `${current.guestName} is still in Room ${r.roomNumber}.` };
  }

  const { error } = await admin
    .from("hotel_bookings")
    .update({
      status: "checked_in",
      checked_in_at: new Date().toISOString(),
      id_proof_type: input.idProofType?.trim() || detail.idProofType,
      id_proof_number: input.idProofNumber?.trim() || detail.idProofNumber,
    })
    .eq("id", input.bookingId)
    .eq("shop_id", session.shopId)
    .eq("status", "reserved");
  if (error) return { error: "Could not check the guest in" };
  await logAuditEvent({ admin, shopId: session.shopId, staffId: session.userId, action: "hotel_check_in", entityType: "hotel_booking", entityId: input.bookingId });
  refreshHotel(input.bookingId);
  revalidatePath("/restaurant");
  return {};
}

// ─── The guest's account ───────────────────────────────────────────────

export async function addChargeAction(input: { bookingId: string; kind: string; description: string; amount: number; gstPercent: number }): Promise<HotelResult> {
  const ctx = await open();
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const description = input.description.trim();
  if (!description) return { error: "Say what the charge is for" };
  const amount = money(input.amount);
  if (amount === null || amount <= 0) return { error: "Enter the amount before tax" };
  const gst = Number(input.gstPercent);
  if (!Number.isFinite(gst) || gst < 0 || gst > 40) return { error: "GST % must be between 0 and 40" };
  const { data: booking } = await admin.from("hotel_bookings").select("status").eq("id", input.bookingId).eq("shop_id", session.shopId).maybeSingle();
  if (!booking) return { error: "Booking not found" };
  if (booking.status !== "reserved" && booking.status !== "checked_in") return { error: "This booking is closed." };
  const { error } = await admin.from("hotel_charges").insert({
    booking_id: input.bookingId,
    shop_id: session.shopId,
    kind: input.kind || "misc",
    description,
    amount,
    gst_percent: gst,
    posted_by: session.userId,
  });
  if (error) return { error: "Could not add the charge" };
  refreshHotel(input.bookingId);
  return {};
}

export async function removeChargeAction(chargeId: string): Promise<HotelResult> {
  const ctx = await open();
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const { data: charge } = await admin.from("hotel_charges").select("id, booking_id").eq("id", chargeId).eq("shop_id", session.shopId).maybeSingle();
  if (!charge) return { error: "Charge not found" };
  const { data: booking } = await admin.from("hotel_bookings").select("status").eq("id", charge.booking_id).maybeSingle();
  if (!booking || (booking.status !== "reserved" && booking.status !== "checked_in")) return { error: "This booking is closed." };
  const { error } = await admin.from("hotel_charges").delete().eq("id", chargeId);
  if (error) return { error: "Could not remove the charge" };
  refreshHotel(charge.booking_id);
  return {};
}

export async function addPaymentAction(input: { bookingId: string; kind: "advance" | "payment" | "refund"; amount: number; method: PaymentMethod; reference?: string }): Promise<HotelResult> {
  const ctx = await open();
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  const invalid = validPayment({ method: input.method, amount: input.amount });
  if (invalid) return { error: invalid };
  if (input.kind === "refund" && !isManager(session)) return { error: "Only the owner or a manager can record a refund." };
  const { data: booking } = await admin.from("hotel_bookings").select("status").eq("id", input.bookingId).eq("shop_id", session.shopId).maybeSingle();
  if (!booking) return { error: "Booking not found" };
  if (booking.status !== "reserved" && booking.status !== "checked_in") return { error: "This booking is closed." };
  const { error } = await admin.from("hotel_payments").insert({
    booking_id: input.bookingId,
    shop_id: session.shopId,
    kind: input.kind,
    amount: round2(input.amount),
    payment_method: input.method,
    reference: input.reference?.trim() || null,
    created_by: session.userId,
  });
  if (error) return { error: "Could not record the payment" };
  refreshHotel(input.bookingId);
  return {};
}

// ─── The stay's GST invoice ────────────────────────────────────────────

async function insertStayBill(
  admin: Admin,
  session: SessionContext,
  p: {
    bookingId: string;
    customerId: string | null;
    items: FolioInvoiceItem[];
    totals: ReturnType<typeof calculateTransactionTotals>;
    discount: number;
    priceIncludesGst: boolean;
    creditAmount: number;
    paymentMethod: PaymentMethod;
  },
): Promise<{ billId: string; invoiceNumber: string } | { error: string }> {
  const financialYear = financialYearFor(new Date());
  const { data: issued, error: numberError } = await admin.rpc("next_invoice_number", { p_shop_id: session.shopId, p_financial_year: financialYear });
  if (numberError || issued == null) return { error: "Could not generate an invoice number. Please try again." };
  const invoiceNumber = `${financialYear}/${String(issued).padStart(5, "0")}`;
  const { data: staffRow } = await admin.from("staff").select("branch_id").eq("id", session.userId).single();

  const { data: bill, error } = await admin
    .from("bills")
    .insert({
      shop_id: session.shopId,
      customer_id: p.customerId,
      staff_id: session.userId,
      branch_id: staffRow?.branch_id ?? null,
      hotel_booking_id: p.bookingId,
      invoice_number: invoiceNumber,
      financial_year: financialYear,
      subtotal: p.totals.subtotal,
      discount_type: "flat",
      discount_value: p.discount,
      discount_amount: p.totals.discountAmount,
      payment_method: p.paymentMethod,
      taxable_amount: p.totals.taxableAmount,
      price_includes_gst: p.priceIncludesGst,
      supply_type: "intra",
      cgst_amount: p.totals.cgstAmount,
      sgst_amount: p.totals.sgstAmount,
      igst_amount: p.totals.igstAmount,
      gst_amount: p.totals.gstAmount,
      round_off_amount: p.totals.roundOffAmount,
      total: p.totals.total,
      paid_amount: round2(p.totals.total - p.creditAmount),
      credit_amount: p.creditAmount,
    })
    .select("id")
    .single();
  if (error || !bill) return { error: "Could not create the invoice" };

  const rows = p.items.map((item, i) => {
    const line = p.totals.lines[i];
    return {
      bill_id: bill.id,
      product_id: null,
      product_name: item.description,
      hsn_code: item.hsnCode,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      gst_percent: item.gstPercent,
      warranty_months: null,
      mrp: null,
      warranty_expires_on: null,
      line_subtotal: line.lineSubtotal,
      cgst_amount: line.cgst,
      sgst_amount: line.sgst,
      igst_amount: line.igst,
      line_gst: line.lineGst,
      line_total: round2(line.lineSubtotal + line.lineGst),
    };
  });
  const { error: itemsError } = await admin.from("bill_items").insert(rows);
  if (itemsError) {
    await admin.from("bills").delete().eq("id", bill.id);
    return { error: "Could not save the invoice lines" };
  }
  return { billId: bill.id, invoiceNumber };
}

function topMethod(payments: { method: string; amount: number }[]): PaymentMethod {
  const sums = new Map<string, number>();
  for (const p of payments) sums.set(p.method, (sums.get(p.method) ?? 0) + p.amount);
  const best = [...sums.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return (PAYMENT_METHODS.includes(best as PaymentMethod) ? best : "cash") as PaymentMethod;
}

export async function checkOutAction(input: {
  bookingId: string;
  /** Flat discount off the room and extras, before tax. */
  discount: number;
  /** What the guest pays now, split however they like. */
  payments: { method: PaymentMethod; amount: number; reference?: string }[];
  /** Whatever is still owed goes on the guest's account (udhaar) instead of being collected now. */
  leaveUnpaid: boolean;
  /** How to hand back money when the guest has paid more than the bill. */
  refundMethod?: PaymentMethod;
}): Promise<HotelResult & { billId?: string }> {
  const ctx = await open();
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;

  const detail = await loadBookingDetail(admin, session.shopId, input.bookingId);
  if (!detail) return { error: "Booking not found" };
  if (detail.status !== "checked_in") return { error: detail.status === "checked_out" ? "This guest has already checked out." : "Only a guest who has checked in can check out." };

  const discount = round2(Math.max(0, Number(input.discount) || 0));
  if (discount > 0 && !hasPermission(session, "give_discounts")) return { error: "You don't have permission to give a discount." };
  for (const p of input.payments) {
    const invalid = validPayment(p);
    if (invalid) return { error: invalid };
  }

  // Open room-service orders must be closed first, or their food would be
  // missing from the bill.
  const roomIds = detail.rooms.map((r) => r.roomId).filter(Boolean) as string[];
  if (roomIds.length) {
    const { data: tables } = await admin.from("restaurant_tables").select("id, name").eq("shop_id", session.shopId).in("hotel_room_id", roomIds);
    const tableIds = (tables ?? []).map((t) => t.id);
    if (tableIds.length) {
      const { data: openOrders } = await admin.from("restaurant_orders").select("id, table_id").eq("shop_id", session.shopId).eq("status", "open").in("table_id", tableIds);
      if (openOrders?.length) {
        const name = tables?.find((t) => t.id === openOrders[0].table_id)?.name ?? "the room";
        return { error: `${name} has a restaurant order that isn't closed. Charge it to the room (or cancel it) before checking out.` };
      }
    }
  }

  const priorPayments = detail.payments;
  const newPayments = input.payments.map((p, i) => ({ id: `new-${i}`, kind: "payment" as const, amount: round2(p.amount), method: p.method }));
  const folio = computeFolio({
    rooms: toFolioRooms(detail.rooms, detail.nights),
    charges: detail.charges,
    roomService: detail.roomService,
    payments: [...priorPayments, ...newPayments],
    discount,
  });
  if (discount > folio.roomSubtotal + folio.chargesSubtotal) return { error: "The discount is more than the bill." };

  const owed = folio.balance;
  if (owed > 0.009 && !input.leaveUnpaid) return { error: `₹${owed.toLocaleString("en-IN")} is still due — collect it, or choose to keep it as due on the guest's account.` };

  let customerId = detail.customerId;
  if ((owed > 0.009 || folio.refundDue > 0.009) && !customerId && detail.guestPhone) {
    const c = await resolveCustomer(admin, session.shopId, detail.guestName, detail.guestPhone);
    customerId = c.id;
    if (customerId) await admin.from("hotel_bookings").update({ customer_id: customerId }).eq("id", detail.id);
  }
  if (owed > 0.009 && !customerId) return { error: "To keep a balance due, add the guest's mobile number first (Edit guest)." };

  const limitError = await billLimitError(session);
  if (limitError) return { error: limitError };

  // A retry after a half-finished check-out reuses the invoice already made.
  const { data: existingBill } = await admin.from("bills").select("id").eq("hotel_booking_id", detail.id).eq("status", "active").maybeSingle();

  if (input.payments.length) {
    const { error } = await admin.from("hotel_payments").insert(
      input.payments.map((p) => ({
        booking_id: detail.id,
        shop_id: session.shopId,
        kind: "payment" as const,
        amount: round2(p.amount),
        payment_method: p.method,
        reference: p.reference?.trim() || null,
        created_by: session.userId,
      })),
    );
    if (error) return { error: "Could not record the payment" };
  }
  if (folio.refundDue > 0.009) {
    await admin.from("hotel_payments").insert({
      booking_id: detail.id,
      shop_id: session.shopId,
      kind: "refund",
      amount: folio.refundDue,
      payment_method: input.refundMethod ?? "cash",
      reference: "Returned at check-out",
      created_by: session.userId,
    });
  }

  const alloc = allocateUnpaid({ invoiceTotal: folio.invoiceTotal, roomService: detail.roomService, unpaid: owed });
  let billId = existingBill?.id ?? null;
  let invoiceNumber = "";
  if (!billId) {
    const result = await insertStayBill(admin, session, {
      bookingId: detail.id,
      customerId,
      items: folio.items,
      totals: folio.totals,
      discount,
      priceIncludesGst: false,
      creditAmount: alloc.invoiceCredit,
      paymentMethod: topMethod([...priorPayments.filter((p) => p.kind !== "refund"), ...newPayments]),
    });
    if ("error" in result) return { error: result.error };
    billId = result.billId;
    invoiceNumber = result.invoiceNumber;
  }

  for (const oc of alloc.orderCredits) {
    const order = detail.roomService.find((o) => o.id === oc.id);
    await admin
      .from("restaurant_orders")
      .update({ credit_amount: oc.credit, paid_amount: round2((order?.total ?? oc.credit) - oc.credit), customer_id: customerId })
      .eq("id", oc.id)
      .eq("shop_id", session.shopId);
  }

  const { error: bookingError } = await admin
    .from("hotel_bookings")
    .update({ status: "checked_out", checked_out_at: new Date().toISOString(), bill_id: billId, discount })
    .eq("id", detail.id)
    .eq("shop_id", session.shopId);
  if (bookingError) return { error: "The invoice was created but the booking couldn't be closed — open it and check out again." };

  if (roomIds.length) await admin.from("hotel_rooms").update({ housekeeping: "dirty" }).in("id", roomIds).eq("shop_id", session.shopId);

  await logAuditEvent({
    admin,
    shopId: session.shopId,
    staffId: session.userId,
    action: "hotel_check_out",
    entityType: "hotel_booking",
    entityId: detail.id,
    details: { invoiceNumber, total: folio.grandTotal, unpaid: owed },
  });
  refreshHotel(detail.id);
  revalidatePath("/restaurant");
  revalidatePath("/daily-summary");
  return { billId: billId ?? undefined };
}

/** Cancel a reservation that hasn't arrived, or mark it a no-show. Any advance
 * is returned except the cancellation charge, which is invoiced (tax included). */
export async function cancelBookingAction(input: {
  bookingId: string;
  reason: string;
  outcome: "cancelled" | "no_show";
  /** How much of the advance the hotel keeps, tax included. */
  keepAmount?: number;
  refundMethod?: PaymentMethod;
}): Promise<HotelResult> {
  const ctx = await open();
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;
  if (!isManager(session)) return { error: "Only the owner or a manager can cancel a booking." };

  const detail = await loadBookingDetail(admin, session.shopId, input.bookingId);
  if (!detail) return { error: "Booking not found" };
  if (detail.status !== "reserved") return { error: detail.status === "checked_in" ? "The guest is in the hotel — check them out instead." : "This booking is already closed." };

  const paid = detail.folio.paid;
  const keep = round2(Math.max(0, Number(input.keepAmount) || 0));
  if (keep > paid) return { error: `The hotel can keep at most what was paid (₹${paid.toLocaleString("en-IN")}).` };
  const refund = round2(paid - keep);

  let billId: string | null = null;
  if (keep > 0) {
    const limitError = await billLimitError(session);
    if (limitError) return { error: limitError };
    const avgRate = detail.rooms.length ? detail.rooms.reduce((s, r) => s + r.ratePerNight, 0) / detail.rooms.length : 0;
    const gst = detail.rooms[0] ? roomGstPercent(detail.rooms[0].ratePerNight, null) : accommodationGstPercent(avgRate);
    const items: FolioInvoiceItem[] = [{ description: `Cancellation charges — ${detail.bookingNumber}`, hsnCode: ACCOMMODATION_SAC, quantity: 1, unitPrice: keep, gstPercent: gst }];
    const totals = calculateTransactionTotals({
      items: items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice, gstPercent: i.gstPercent })),
      discountType: "flat",
      discountValue: 0,
      paidAmount: keep,
      supplyType: "intra",
      priceMode: "inclusive",
    });
    const paymentMethods = detail.payments.filter((p) => p.kind !== "refund");
    const result = await insertStayBill(admin, session, {
      bookingId: detail.id,
      customerId: detail.customerId,
      items,
      totals,
      discount: 0,
      priceIncludesGst: true,
      creditAmount: round2(Math.max(0, totals.total - keep)),
      paymentMethod: topMethod(paymentMethods),
    });
    if ("error" in result) return { error: result.error };
    billId = result.billId;
  }

  if (refund > 0) {
    await admin.from("hotel_payments").insert({
      booking_id: detail.id,
      shop_id: session.shopId,
      kind: "refund",
      amount: refund,
      payment_method: input.refundMethod ?? "cash",
      reference: input.outcome === "no_show" ? "Refund — no-show" : "Refund — cancelled",
      created_by: session.userId,
    });
  }

  const { error } = await admin
    .from("hotel_bookings")
    .update({ status: input.outcome, cancelled_at: new Date().toISOString(), cancel_reason: input.reason.trim() || null, bill_id: billId })
    .eq("id", detail.id)
    .eq("shop_id", session.shopId);
  if (error) return { error: "Could not cancel the booking" };
  await logAuditEvent({ admin, shopId: session.shopId, staffId: session.userId, action: `hotel_${input.outcome}`, entityType: "hotel_booking", entityId: detail.id, details: { keep, refund } });
  refreshHotel(detail.id);
  return {};
}

// ─── Room service ──────────────────────────────────────────────────────

/** Post a restaurant order to the guest's room instead of taking payment: the
 * order is closed (and taxed) as usual, and its amount is settled with the rest
 * of the guest's bill at check-out. */
export async function chargeOrderToRoomAction(orderId: string, discountValue: number): Promise<HotelResult> {
  const ctx = await open();
  if ("error" in ctx) return ctx;
  const { session, admin } = ctx;

  const { data: order } = await admin.from("restaurant_orders").select("id, status, table_id, discount_value").eq("id", orderId).eq("shop_id", session.shopId).maybeSingle();
  if (!order) return { error: "Order not found" };
  if (order.status !== "open") return { error: "This order is already closed." };
  const { data: table } = await admin.from("restaurant_tables").select("hotel_room_id").eq("id", order.table_id).maybeSingle();
  if (!table?.hotel_room_id) return { error: "Only an order taken for a hotel room can be charged to a room." };
  const guest = await currentGuestForRoom(admin, session.shopId, table.hotel_room_id);
  if (!guest) return { error: "No guest is checked in to this room, so there's no account to charge." };

  const discount = Math.max(0, Number(discountValue) || 0);
  if (discount !== Number(order.discount_value)) {
    const applied = await applyOrderDiscountAction(orderId, "flat", discount);
    if (applied.error) return applied;
  }
  const { data: fresh } = await admin.from("restaurant_orders").select("total").eq("id", orderId).single();
  const total = round2(Number(fresh?.total ?? 0));
  if (total <= 0) return { error: "Add at least one item before charging the room." };

  // Tie the order to the guest's booking BEFORE closing it: if anything fails
  // half-way the food is still on the guest's account (and the still-open order
  // blocks check-out) instead of being settled as paid and lost from the bill.
  const { error: linkError } = await admin.from("restaurant_orders").update({ hotel_booking_id: guest.bookingId }).eq("id", orderId).eq("shop_id", session.shopId);
  if (linkError) return { error: "Could not charge the room — try again." };

  const settled = await settleOrderAction(orderId, [{ method: "other", amount: total }], "flat", discount);
  if (settled.error) {
    await admin.from("restaurant_orders").update({ hotel_booking_id: null }).eq("id", orderId).eq("shop_id", session.shopId).eq("status", "open");
    return settled;
  }

  const { data: booking } = await admin.from("hotel_bookings").select("customer_id").eq("id", guest.bookingId).maybeSingle();
  if (booking?.customer_id) await admin.from("restaurant_orders").update({ customer_id: booking.customer_id }).eq("id", orderId).eq("shop_id", session.shopId);

  refreshHotel(guest.bookingId);
  revalidatePath("/restaurant");
  return {};
}
