"use server";

import { requireSession } from "../auth";
import { hasArea } from "../staffAccess";
import { isModuleEnabled } from "../modules";
import { createSupabaseAdminClient } from "../supabase/admin";
import { allRows } from "../supabase/allRows";
import { isIsoDate, nightsBetween } from "../hotel/dates";
import { sourceLabel, type MealPlan, type PaymentMethod } from "../hotel/constants";
import { parseBookingRow, parseRoomRow, type HotelExport, type SheetRow } from "../hotel/importFile";
import { hotelSchemaReady, loadInventory } from "../hotel/server";
import { hotelOpsReady, loose } from "../hotel/ops";
import { addRoomsAction, createBookingAction, saveRoomTypeAction } from "./hotel";

export type HotelImportResult = { typesMade: number; roomsAdded: number; roomsSkipped: number; bookingsMade: number; bookingsSkipped: number; errors: { sheet: string; row: number; message: string }[] };

const MAX_ROOM_ROWS = 200;
const MAX_BOOKING_ROWS = 300;

async function refusal() {
  const session = await requireSession();
  if (session.businessType !== "hotel") return { session, why: "This is for hotels." };
  if (!(await hotelSchemaReady())) return { session, why: "The hotel tables aren't set up yet." };
  if (!isModuleEnabled(session.enabledModules, "bulk_import_export")) return { session, why: "Bulk import/export isn't enabled for this shop." };
  if (!hasArea(session, "manage_products") && session.role === "staff") return { session, why: "You don't have access to this — ask the owner." };
  return { session, why: null };
}

const empty = (message: string): HotelImportResult => ({ typesMade: 0, roomsAdded: 0, roomsSkipped: 0, bookingsMade: 0, bookingsSkipped: 0, errors: [{ sheet: "", row: 0, message }] });

/** Rooms first, then bookings, each through the same actions the screens use: same checks, same
 * availability, and a room gets its room-service table. A row that fails is listed; the rest go in. */
export async function importHotelFileAction(rooms: SheetRow[], bookings: SheetRow[]): Promise<HotelImportResult> {
  const { session, why } = await refusal();
  if (why) return empty(why);
  if (!Array.isArray(rooms) || !Array.isArray(bookings)) return empty("The file has no rows.");
  if (rooms.length > MAX_ROOM_ROWS) return empty(`One file can bring up to ${MAX_ROOM_ROWS} room rows.`);
  if (bookings.length > MAX_BOOKING_ROWS) return empty(`One file can bring up to ${MAX_BOOKING_ROWS} bookings. Split it into smaller files.`);
  if (bookings.length && session.role === "staff") return empty("Only the owner or a manager can bring in bookings.");
  const admin = createSupabaseAdminClient();
  const out: HotelImportResult = { typesMade: 0, roomsAdded: 0, roomsSkipped: 0, bookingsMade: 0, bookingsSkipped: 0, errors: [] };

  const { types } = await loadInventory(admin, session.shopId);
  const typeId = new Map(types.map((t) => [t.name.trim().toLowerCase(), t.id]));

  for (const r of rooms) {
    const { item, problems } = parseRoomRow(r.cells ?? {});
    if (!item) {
      out.errors.push({ sheet: "Rooms", row: r.row, message: problems.join("; ") });
      continue;
    }
    const key = item.type.toLowerCase();
    let id = typeId.get(key);
    if (!id) {
      if (item.rate === null) {
        out.errors.push({ sheet: "Rooms", row: r.row, message: "Rate per night is needed for a new room type" });
        continue;
      }
      const made = await saveRoomTypeAction({ name: item.type, baseRate: item.rate, maxAdults: item.maxAdults, maxChildren: item.maxChildren, amenities: item.amenities, gstPercent: item.gst });
      if (made.error || !made.id) {
        out.errors.push({ sheet: "Rooms", row: r.row, message: made.error ?? "Could not add the room type" });
        continue;
      }
      id = made.id;
      typeId.set(key, id);
      out.typesMade += 1;
    }
    if (!item.numbers) continue;
    const added = await addRoomsAction({ roomTypeId: id, numbers: item.numbers, floor: item.floor });
    if (added.error) out.errors.push({ sheet: "Rooms", row: r.row, message: added.error });
    out.roomsAdded += added.added ?? 0;
    out.roomsSkipped += added.skipped?.length ?? 0;
  }

  if (bookings.length) {
    const { types: now } = await loadInventory(admin, session.shopId);
    const rateOf = new Map(now.map((t) => [t.id, t.baseRate]));
    const idOf = new Map(now.map((t) => [t.name.trim().toLowerCase(), t.id]));
    const { data: existing } = await allRows((a, b) => admin.from("hotel_bookings").select("id, guest_name, check_in_date, check_out_date").eq("shop_id", session.shopId).in("status", ["reserved", "checked_in", "checked_out"]).order("id").range(a, b));
    const seen = new Set((existing ?? []).map((b) => `${b.guest_name.trim().toLowerCase()}|${b.check_in_date}|${b.check_out_date}`));
    for (const r of bookings) {
      const { item, problems } = parseBookingRow(r.cells ?? {});
      if (!item) {
        out.errors.push({ sheet: "Bookings", row: r.row, message: problems.join("; ") });
        continue;
      }
      const key = `${item.guest.toLowerCase()}|${item.checkIn}|${item.checkOut}`;
      if (seen.has(key)) {
        out.bookingsSkipped += 1;
        continue;
      }
      const id = idOf.get(item.type.toLowerCase());
      if (!id) {
        out.errors.push({ sheet: "Bookings", row: r.row, message: `No room type called "${item.type}"` });
        continue;
      }
      const rate = item.rate ?? rateOf.get(id) ?? 0;
      const made = await createBookingAction({
        guestName: item.guest,
        guestPhone: item.phone,
        adults: item.adults,
        children: item.children,
        source: item.source,
        sourceRef: item.ref,
        agentName: item.source === "agent" ? item.ref : "",
        commissionPercent: item.commission,
        mealPlan: item.meal as MealPlan,
        checkIn: item.checkIn,
        checkOut: item.checkOut,
        specialRequests: "",
        rooms: Array.from({ length: item.rooms }, () => ({ roomTypeId: id, roomId: null, ratePerNight: rate })),
        advanceAmount: item.advance > 0 ? item.advance : undefined,
        advanceMethod: item.advanceMode as PaymentMethod,
      });
      if (made.error) {
        out.errors.push({ sheet: "Bookings", row: r.row, message: made.error });
        continue;
      }
      seen.add(key);
      out.bookingsMade += 1;
    }
  }
  return out;
}

const inRange = (from: string, to: string) => isIsoDate(from) && isIsoDate(to) && from <= to && nightsBetween(from, to) <= 800;

/** Everything a hotel may want in Excel for a period, by the stay's dates. */
export async function hotelExportAction(from: string, to: string): Promise<{ error?: string; sheets?: HotelExport }> {
  const { session, why } = await refusal();
  if (why) return { error: why };
  if (!inRange(from, to)) return { error: "Choose a period of up to two years." };
  const admin = createSupabaseAdminClient();
  const db = loose(admin);
  const shopId = session.shopId;
  const opsTables = await hotelOpsReady(admin);
  const startTs = new Date(`${from}T00:00:00+05:30`).toISOString();
  const endTs = new Date(`${to}T23:59:59.999+05:30`).toISOString();

  const [{ types, rooms }, { data: bookings }, { data: charges }, { data: payments }] = await Promise.all([
    loadInventory(admin, shopId),
    allRows<Record<string, never>>((a, b) => db.from("hotel_bookings").select("*").eq("shop_id", shopId).lte("check_in_date", to).gte("check_out_date", from).order("check_in_date").order("id").range(a, b) as never),
    allRows((a, b) => admin.from("hotel_charges").select("id, booking_id, kind, description, amount, gst_percent, created_at").eq("shop_id", shopId).gte("created_at", startTs).lte("created_at", endTs).order("id").range(a, b)),
    allRows((a, b) => admin.from("hotel_payments").select("id, booking_id, kind, amount, payment_method, reference, created_at").eq("shop_id", shopId).gte("created_at", startTs).lte("created_at", endTs).order("id").range(a, b)),
  ]);
  const list = (bookings ?? []) as unknown as Record<string, string | number | null>[];
  const ids = list.map((b) => String(b.id));
  const assigned: { booking_id: string; room_type_id: string; room_id: string | null; rate_per_night: number }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from("hotel_booking_rooms").select("booking_id, room_type_id, room_id, rate_per_night").in("booking_id", ids.slice(i, i + 200));
    assigned.push(...(data ?? []));
  }
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const roomNumber = new Map(rooms.map((r) => [r.id, r.roomNumber]));
  const number = new Map(list.map((b) => [String(b.id), String(b.booking_number)]));
  const mine = (id: unknown) => assigned.filter((a) => a.booking_id === id);
  const foreign = list.filter((b) => String(b.nationality ?? "").trim().toLowerCase() !== "indian");

  const sheets: HotelExport = [
    {
      sheet: "Rooms",
      headers: ["Room type", "Rate per night", "Room numbers", "Floor", "Adults per room", "Children per room", "GST %", "Amenities", "Out of service"],
      rows: rooms.map((r) => {
        const t = types.find((x) => x.id === r.roomTypeId);
        return [r.roomTypeName, t?.baseRate ?? 0, r.roomNumber, r.floor, t?.maxAdults ?? null, t?.maxChildren ?? null, t?.gstPercent ?? null, t?.amenities ?? null, r.isBlocked ? r.blockReason || "Yes" : ""];
      }),
    },
    {
      sheet: "Bookings",
      headers: ["Booking", "Status", "Guest name", "Mobile", "Check-in", "Check-out", "Nights", "Room type", "Room numbers", "Rate per night", "Adults", "Children", "Source", "Booking ID", "Commission %", "Meal plan", "Group"],
      rows: list.map((b) => {
        const rs = mine(b.id);
        return [b.booking_number, b.status, b.guest_name, b.guest_phone, b.check_in_date, b.check_out_date, nightsBetween(String(b.check_in_date), String(b.check_out_date)), [...new Set(rs.map((r) => typeName.get(r.room_type_id) ?? ""))].join(", "), rs.map((r) => (r.room_id ? roomNumber.get(r.room_id) ?? "" : "")).filter(Boolean).join(" "), rs.length ? Math.round(rs.reduce((s, r) => s + Number(r.rate_per_night), 0) / rs.length) : 0, b.adults, b.children, sourceLabel(String(b.source)), b.source_ref, Number(b.commission_percent), b.meal_plan, b.group_name ?? null];
      }),
    },
    {
      sheet: "Guest register",
      headers: ["Booking", "Guest name", "Mobile", "Nationality", "ID type", "ID number", "Address", "Adults", "Children", "Rooms", "Check-in", "Check-out", "Status"],
      rows: list.filter((b) => b.status === "checked_in" || b.status === "checked_out").map((b) => [b.booking_number, b.guest_name, b.guest_phone, b.nationality, b.id_proof_type, b.id_proof_number, b.guest_address ?? null, b.adults, b.children, mine(b.id).map((r) => (r.room_id ? roomNumber.get(r.room_id) ?? "" : "")).filter(Boolean).join(" "), b.check_in_date, b.check_out_date, b.status]),
    },
    {
      sheet: "Charges",
      headers: ["Booking", "Date", "Kind", "Description", "Amount before tax", "GST %"],
      rows: (charges ?? []).map((c) => [number.get(c.booking_id) ?? "", c.created_at.slice(0, 10), c.kind, c.description, Number(c.amount), Number(c.gst_percent)]),
    },
    {
      sheet: "Payments",
      headers: ["Booking", "Date", "Kind", "Amount", "Mode", "Reference"],
      rows: (payments ?? []).map((p) => [number.get(p.booking_id) ?? "", p.created_at.slice(0, 10), p.kind, Number(p.amount), p.payment_method, p.reference]),
    },
  ];
  if (opsTables && foreign.length) {
    sheets.push({
      sheet: "Form C",
      headers: ["Booking", "Guest name", "Nationality", "Gender", "Date of birth", "Passport number", "Passport place of issue", "Passport issue date", "Passport valid till", "Visa number", "Visa type", "Visa place of issue", "Visa issue date", "Visa valid till", "Arrived in India", "Check-in", "Check-out", "Coming from", "Going to", "Purpose", "Filed on", "Reference"],
      rows: foreign.map((b) => [b.booking_number, b.guest_name, b.nationality, b.gender, b.date_of_birth, b.passport_number, b.passport_issued_at, b.passport_issue_date, b.passport_expiry, b.visa_number, b.visa_type, b.visa_issued_at, b.visa_issue_date, b.visa_expiry, b.arrival_in_india, b.check_in_date, b.check_out_date, b.arrived_from, b.going_to, b.visit_purpose, b.form_c_filed_at ? String(b.form_c_filed_at).slice(0, 10) : null, b.form_c_reference]),
    });
  }
  return { sheets };
}
