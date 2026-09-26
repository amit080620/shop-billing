import { createSupabaseAdminClient } from "../supabase/admin";
import { addDays, nightsBetween } from "./dates";
import { todayIso } from "../dateHelpers";
import { roomGstPercent } from "./gst";
import { computeFolio, toFolioRooms, type FolioCharge, type FolioPayment, type FolioRoomServiceOrder } from "./folio";
import { availabilityByType, type BookedRoomLite, type RoomLite } from "./availability";
import type { BookingStatus } from "./constants";
import { summarizeStays } from "./reports";

export type Admin = ReturnType<typeof createSupabaseAdminClient>;

let schemaReady = false;

/** Whether migration 0041 has been run. Until it has, the hotel screens show
 * a set-up notice instead of failing on a missing table. Only a positive
 * answer is remembered — a shop that runs the migration mid-session is
 * picked up on the next request. */
export async function hotelSchemaReady(admin: Admin = createSupabaseAdminClient()): Promise<boolean> {
  if (schemaReady) return true;
  const { error } = await admin.from("hotel_rooms").select("id").limit(1);
  if (error) return false;
  schemaReady = true;
  return true;
}

export type RoomTypeRow = {
  id: string;
  name: string;
  description: string | null;
  baseRate: number;
  maxAdults: number;
  maxChildren: number;
  amenities: string | null;
  gstPercent: number | null;
  isActive: boolean;
};

export type RoomRow = {
  id: string;
  roomNumber: string;
  floor: string | null;
  roomTypeId: string;
  roomTypeName: string;
  housekeeping: "clean" | "dirty";
  isBlocked: boolean;
  blockReason: string | null;
};

/** Natural room order: 101, 102, ... 110 (numeric where possible, so 9 comes
 * before 10) and text such as "G1" after them. */
export function compareRoomNumbers(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

export async function loadInventory(admin: Admin, shopId: string): Promise<{ types: RoomTypeRow[]; rooms: RoomRow[] }> {
  const [{ data: types }, { data: rooms }] = await Promise.all([
    admin
      .from("hotel_room_types")
      .select("id, name, description, base_rate, max_adults, max_children, amenities, gst_percent, is_active")
      .eq("shop_id", shopId)
      .eq("is_active", true)
      .order("base_rate", { ascending: true }),
    admin
      .from("hotel_rooms")
      .select("id, room_number, floor, room_type_id, housekeeping, is_blocked, block_reason")
      .eq("shop_id", shopId)
      .eq("is_active", true),
  ]);

  const typeRows: RoomTypeRow[] = (types ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    baseRate: Number(t.base_rate),
    maxAdults: t.max_adults,
    maxChildren: t.max_children,
    amenities: t.amenities,
    gstPercent: t.gst_percent == null ? null : Number(t.gst_percent),
    isActive: t.is_active,
  }));
  const typeName = new Map(typeRows.map((t) => [t.id, t.name]));
  const roomRows: RoomRow[] = (rooms ?? [])
    .map((r) => ({
      id: r.id,
      roomNumber: r.room_number,
      floor: r.floor,
      roomTypeId: r.room_type_id,
      roomTypeName: typeName.get(r.room_type_id) ?? "Room",
      housekeeping: r.housekeeping,
      isBlocked: r.is_blocked,
      blockReason: r.block_reason,
    }))
    .sort((a, b) => compareRoomNumbers(a.roomNumber, b.roomNumber));
  return { types: typeRows, rooms: roomRows };
}

export function toRoomLite(rooms: RoomRow[]): RoomLite[] {
  return rooms.map((r) => ({ id: r.id, roomTypeId: r.roomTypeId, isBlocked: r.isBlocked }));
}

/** Every room on a booking that still holds inventory (reserved or in-house). */
export async function loadActiveBookedRooms(admin: Admin, shopId: string): Promise<BookedRoomLite[]> {
  const { data } = await admin
    .from("hotel_booking_rooms")
    .select("booking_id, room_type_id, room_id, hotel_bookings!inner ( check_in_date, check_out_date, status )")
    .eq("shop_id", shopId)
    .in("hotel_bookings.status", ["reserved", "checked_in"]);

  return (data ?? []).map((row) => {
    const b = Array.isArray(row.hotel_bookings) ? row.hotel_bookings[0] : row.hotel_bookings;
    return {
      bookingId: row.booking_id,
      roomTypeId: row.room_type_id,
      roomId: row.room_id,
      checkIn: b.check_in_date,
      checkOut: b.check_out_date,
    };
  });
}

export type BookingRoomView = {
  id: string;
  roomTypeId: string;
  roomTypeName: string;
  roomId: string | null;
  roomNumber: string | null;
  ratePerNight: number;
  gstPercent: number;
  housekeeping: "clean" | "dirty" | null;
};

export type BookingDetail = {
  id: string;
  bookingNumber: string;
  status: BookingStatus;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  nationality: string;
  customerId: string | null;
  adults: number;
  children: number;
  source: string;
  sourceRef: string | null;
  agentName: string | null;
  commissionPercent: number;
  mealPlan: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  idProofType: string | null;
  idProofNumber: string | null;
  specialRequests: string | null;
  discount: number;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  billId: string | null;
  createdAt: string;
  rooms: BookingRoomView[];
  charges: (FolioCharge & { kind: string; createdAt: string })[];
  payments: (FolioPayment & { reference: string | null; createdAt: string })[];
  roomService: (FolioRoomServiceOrder & { settledAt: string | null; tableName: string | null })[];
  folio: ReturnType<typeof computeFolio>;
};

/** One booking with everything on its guest account, and the running totals. */
export async function loadBookingDetail(admin: Admin, shopId: string, bookingId: string): Promise<BookingDetail | null> {
  const { data: b } = await admin.from("hotel_bookings").select("*").eq("id", bookingId).eq("shop_id", shopId).maybeSingle();
  if (!b) return null;

  const [{ data: bookingRooms }, { data: charges }, { data: payments }, { data: orders }, { data: types }] = await Promise.all([
    admin.from("hotel_booking_rooms").select("id, room_type_id, room_id, rate_per_night").eq("booking_id", bookingId).order("created_at"),
    admin.from("hotel_charges").select("id, kind, description, amount, gst_percent, created_at").eq("booking_id", bookingId).order("created_at"),
    admin.from("hotel_payments").select("id, kind, amount, payment_method, reference, created_at").eq("booking_id", bookingId).order("created_at"),
    admin
      .from("restaurant_orders")
      .select("id, order_number, total, settled_at, restaurant_tables ( name )")
      .eq("shop_id", shopId)
      .eq("hotel_booking_id", bookingId)
      .neq("status", "cancelled")
      .order("settled_at"),
    admin.from("hotel_room_types").select("id, name, gst_percent").eq("shop_id", shopId),
  ]);

  const roomIds = [...new Set((bookingRooms ?? []).map((r) => r.room_id).filter(Boolean))] as string[];
  const { data: roomRows } = roomIds.length
    ? await admin.from("hotel_rooms").select("id, room_number, housekeeping").in("id", roomIds)
    : { data: [] as { id: string; room_number: string; housekeeping: "clean" | "dirty" }[] };
  const roomById = new Map((roomRows ?? []).map((r) => [r.id, r]));
  const typeById = new Map((types ?? []).map((t) => [t.id, t]));

  const nights = nightsBetween(b.check_in_date, b.check_out_date);
  const rooms: BookingRoomView[] = (bookingRooms ?? []).map((r) => {
    const type = typeById.get(r.room_type_id);
    const room = r.room_id ? roomById.get(r.room_id) : undefined;
    const rate = Number(r.rate_per_night);
    return {
      id: r.id,
      roomTypeId: r.room_type_id,
      roomTypeName: type?.name ?? "Room",
      roomId: r.room_id,
      roomNumber: room?.room_number ?? null,
      ratePerNight: rate,
      gstPercent: roomGstPercent(rate, type?.gst_percent == null ? null : Number(type.gst_percent)),
      housekeeping: room?.housekeeping ?? null,
    };
  });

  const folioRooms = toFolioRooms(rooms, nights);
  const chargeRows = (charges ?? []).map((c) => ({
    id: c.id,
    kind: c.kind,
    description: c.description,
    amount: Number(c.amount),
    gstPercent: Number(c.gst_percent),
    createdAt: c.created_at,
  }));
  const paymentRows = (payments ?? []).map((p) => ({
    id: p.id,
    kind: p.kind,
    amount: Number(p.amount),
    method: p.payment_method,
    reference: p.reference,
    createdAt: p.created_at,
  }));
  const roomService = (orders ?? []).map((o) => {
    const table = Array.isArray(o.restaurant_tables) ? o.restaurant_tables[0] : o.restaurant_tables;
    return {
      id: o.id,
      orderNumber: o.order_number,
      total: Number(o.total),
      settledAt: o.settled_at,
      tableName: table?.name ?? null,
    };
  });

  return {
    id: b.id,
    bookingNumber: b.booking_number,
    status: b.status,
    guestName: b.guest_name,
    guestPhone: b.guest_phone,
    guestEmail: b.guest_email,
    nationality: b.nationality,
    customerId: b.customer_id,
    adults: b.adults,
    children: b.children,
    source: b.source,
    sourceRef: b.source_ref,
    agentName: b.agent_name,
    commissionPercent: Number(b.commission_percent),
    mealPlan: b.meal_plan,
    checkIn: b.check_in_date,
    checkOut: b.check_out_date,
    nights,
    idProofType: b.id_proof_type,
    idProofNumber: b.id_proof_number,
    specialRequests: b.special_requests,
    discount: Number(b.discount),
    checkedInAt: b.checked_in_at,
    checkedOutAt: b.checked_out_at,
    cancelledAt: b.cancelled_at,
    cancelReason: b.cancel_reason,
    billId: b.bill_id,
    createdAt: b.created_at,
    rooms,
    charges: chargeRows,
    payments: paymentRows,
    roomService,
    folio: computeFolio({
      rooms: folioRooms,
      charges: chargeRows,
      roomService,
      payments: paymentRows,
      discount: Number(b.discount),
    }),
  };
}

export type BookingListRow = {
  id: string;
  bookingNumber: string;
  status: BookingStatus;
  guestName: string;
  guestPhone: string | null;
  source: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  /** Room numbers where a room is assigned, otherwise the room type's name. */
  roomLabels: string[];
  /** Parallel to roomLabels: true when that label is an assigned room number. */
  roomAssigned: boolean[];
  roomCount: number;
};

/** Bookings with their room numbers, for lists. Filters are applied by the caller in SQL terms. */
export async function loadBookingList(
  admin: Admin,
  shopId: string,
  opts: { statuses?: BookingStatus[]; checkInOn?: string; checkOutOn?: string; from?: string; to?: string; search?: string; limit?: number; newestFirst?: boolean },
): Promise<BookingListRow[]> {
  let q = admin
    .from("hotel_bookings")
    .select("id, booking_number, status, guest_name, guest_phone, source, check_in_date, check_out_date")
    .eq("shop_id", shopId);
  if (opts.statuses?.length) q = q.in("status", opts.statuses);
  if (opts.checkInOn) q = q.eq("check_in_date", opts.checkInOn);
  if (opts.checkOutOn) q = q.eq("check_out_date", opts.checkOutOn);
  if (opts.from) q = q.gte("check_in_date", opts.from);
  if (opts.to) q = q.lte("check_in_date", opts.to);
  if (opts.search) {
    const s = opts.search.replace(/[%,()]/g, " ").trim();
    if (s) q = q.or(`guest_name.ilike.%${s}%,guest_phone.ilike.%${s}%,booking_number.ilike.%${s}%,source_ref.ilike.%${s}%`);
  }
  q = q.order("check_in_date", { ascending: !opts.newestFirst }).limit(opts.limit ?? 200);
  const { data: rows } = await q;
  if (!rows?.length) return [];

  const ids = rows.map((r) => r.id);
  const { data: brs } = await admin.from("hotel_booking_rooms").select("booking_id, room_id, room_type_id").in("booking_id", ids);
  const roomIds = [...new Set((brs ?? []).map((r) => r.room_id).filter(Boolean))] as string[];
  const typeIds = [...new Set((brs ?? []).map((r) => r.room_type_id))];
  const [{ data: roomRows }, { data: typeRows }] = await Promise.all([
    roomIds.length ? admin.from("hotel_rooms").select("id, room_number").in("id", roomIds) : Promise.resolve({ data: [] as { id: string; room_number: string }[] }),
    typeIds.length ? admin.from("hotel_room_types").select("id, name").in("id", typeIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const roomNumber = new Map((roomRows ?? []).map((r) => [r.id, r.room_number]));
  const typeName = new Map((typeRows ?? []).map((t) => [t.id, t.name]));

  return rows.map((r) => {
    const mine = (brs ?? []).filter((x) => x.booking_id === r.id);
    return {
      id: r.id,
      bookingNumber: r.booking_number,
      status: r.status,
      guestName: r.guest_name,
      guestPhone: r.guest_phone,
      source: r.source,
      checkIn: r.check_in_date,
      checkOut: r.check_out_date,
      nights: nightsBetween(r.check_in_date, r.check_out_date),
      roomLabels: mine.map((x) => (x.room_id ? roomNumber.get(x.room_id) ?? "—" : typeName.get(x.room_type_id) ?? "Room")),
      roomAssigned: mine.map((x) => !!x.room_id),
      roomCount: mine.length,
    };
  });
}

/** The in-house booking (if any) currently assigned to a room. */
export async function currentGuestForRoom(admin: Admin, shopId: string, roomId: string) {
  const { data } = await admin
    .from("hotel_booking_rooms")
    .select("booking_id, hotel_bookings!inner ( id, guest_name, status, check_out_date )")
    .eq("shop_id", shopId)
    .eq("room_id", roomId)
    .eq("hotel_bookings.status", "checked_in")
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  const b = Array.isArray(row.hotel_bookings) ? row.hotel_bookings[0] : row.hotel_bookings;
  return { bookingId: b.id, guestName: b.guest_name, checkOut: b.check_out_date };
}

export type BoardEntry = {
  room: RoomRow;
  /** The room's own restaurant table, where room-service orders are taken. */
  tableId: string | null;
  state: "occupied" | "arriving" | "dirty" | "blocked" | "vacant";
  guest: { bookingId: string; name: string; checkOut: string } | null;
  arrival: { bookingId: string; name: string } | null;
};

/** What every room looks like right now, for the room board. */
export async function loadRoomBoard(admin: Admin, shopId: string, today: string): Promise<{ entries: BoardEntry[]; types: RoomTypeRow[] }> {
  const { types, rooms } = await loadInventory(admin, shopId);
  const [{ data: brs }, { data: tableRows }] = await Promise.all([
    admin
      .from("hotel_booking_rooms")
      .select("room_id, hotel_bookings!inner ( id, guest_name, status, check_in_date, check_out_date )")
      .eq("shop_id", shopId)
      .not("room_id", "is", null)
      .in("hotel_bookings.status", ["reserved", "checked_in"]),
    admin.from("restaurant_tables").select("id, hotel_room_id").eq("shop_id", shopId).eq("is_deleted", false).not("hotel_room_id", "is", null),
  ]);
  const tableByRoom = new Map((tableRows ?? []).map((t) => [t.hotel_room_id as string, t.id]));

  const inHouse = new Map<string, { bookingId: string; name: string; checkOut: string }>();
  const arriving = new Map<string, { bookingId: string; name: string }>();
  for (const row of brs ?? []) {
    const b = Array.isArray(row.hotel_bookings) ? row.hotel_bookings[0] : row.hotel_bookings;
    if (!row.room_id) continue;
    if (b.status === "checked_in") inHouse.set(row.room_id, { bookingId: b.id, name: b.guest_name, checkOut: b.check_out_date });
    else if (b.check_in_date === today) arriving.set(row.room_id, { bookingId: b.id, name: b.guest_name });
  }

  const entries: BoardEntry[] = rooms.map((room) => {
    const guest = inHouse.get(room.id) ?? null;
    const arrival = arriving.get(room.id) ?? null;
    let state: BoardEntry["state"] = "vacant";
    if (room.isBlocked) state = "blocked";
    else if (guest) state = "occupied";
    else if (room.housekeeping === "dirty") state = "dirty";
    else if (arrival) state = "arriving";
    return { room, tableId: tableByRoom.get(room.id) ?? null, state, guest, arrival };
  });
  return { entries, types };
}

export type FrontDesk = {
  today: string;
  sellableRooms: number;
  occupiedRooms: number;
  blockedRooms: number;
  dirtyRooms: number;
  occupancyPercent: number;
  receivedToday: number;
  arrivals: BookingListRow[];
  lateArrivals: BookingListRow[];
  departures: BookingListRow[];
  overstays: BookingListRow[];
  inHouse: BookingListRow[];
};

/** Everything the front desk needs at a glance for one day. */
export async function loadFrontDesk(admin: Admin, shopId: string, today: string): Promise<FrontDesk> {
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yIso = yesterday.toISOString().slice(0, 10);
  const startOfDay = new Date(`${today}T00:00:00+05:30`).toISOString();
  const endOfDay = new Date(`${today}T23:59:59.999+05:30`).toISOString();

  const [board, arrivals, lateArrivals, inHouse, { data: payments }] = await Promise.all([
    loadRoomBoard(admin, shopId, today),
    loadBookingList(admin, shopId, { statuses: ["reserved"], checkInOn: today }),
    loadBookingList(admin, shopId, { statuses: ["reserved"], to: yIso }),
    loadBookingList(admin, shopId, { statuses: ["checked_in"] }),
    admin.from("hotel_payments").select("kind, amount").eq("shop_id", shopId).gte("created_at", startOfDay).lte("created_at", endOfDay),
  ]);

  const entries = board.entries;
  const blockedRooms = entries.filter((e) => e.state === "blocked").length;
  const occupiedRooms = entries.filter((e) => e.state === "occupied").length;
  const sellableRooms = entries.length - blockedRooms;
  const receivedToday = (payments ?? []).reduce((s, p) => s + (p.kind === "refund" ? -Number(p.amount) : Number(p.amount)), 0);

  return {
    today,
    sellableRooms,
    occupiedRooms,
    blockedRooms,
    dirtyRooms: entries.filter((e) => e.state === "dirty").length,
    occupancyPercent: sellableRooms > 0 ? Math.round((occupiedRooms / sellableRooms) * 100) : 0,
    receivedToday: Math.round(receivedToday * 100) / 100,
    arrivals,
    lateArrivals,
    departures: inHouse.filter((b) => b.checkOut === today),
    overstays: inHouse.filter((b) => b.checkOut < today),
    inHouse,
  };
}

/** For an order on a room's table: the in-house guest it can be charged to. */
export async function roomChargeTargetForTable(admin: Admin, shopId: string, tableId: string): Promise<{ bookingId: string; roomNumber: string; guestName: string } | null> {
  const { data: table } = await admin.from("restaurant_tables").select("hotel_room_id").eq("id", tableId).eq("shop_id", shopId).maybeSingle();
  if (!table?.hotel_room_id) return null;
  const [{ data: room }, guest] = await Promise.all([
    admin.from("hotel_rooms").select("room_number").eq("id", table.hotel_room_id).maybeSingle(),
    currentGuestForRoom(admin, shopId, table.hotel_room_id),
  ]);
  if (!room || !guest) return null;
  return { bookingId: guest.bookingId, roomNumber: room.room_number, guestName: guest.guestName };
}

export type CalendarBar = {
  bookingId: string;
  guestName: string;
  status: BookingStatus;
  source: string;
  checkIn: string;
  checkOut: string;
  /** Still in the room after their check-out date; the bar is drawn through tonight. */
  overstay?: boolean;
};

export type Calendar = {
  days: string[];
  rooms: RoomRow[];
  types: RoomTypeRow[];
  /** roomId → bookings on that room that touch the window */
  barsByRoom: Record<string, CalendarBar[]>;
  /** Bookings holding a room type but no specific room yet. */
  unassigned: (CalendarBar & { roomTypeName: string })[];
  /** typeId → free-room count for each day in the window */
  freeByType: Record<string, number[]>;
};

/** The tape chart: every room across a run of days, with who is in it. */
export async function loadCalendar(admin: Admin, shopId: string, from: string, dayCount: number): Promise<Calendar> {
  const days: string[] = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  const windowEnd = days[days.length - 1];
  const endExclusive = new Date(`${windowEnd}T00:00:00Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const end = endExclusive.toISOString().slice(0, 10);

  const { types, rooms } = await loadInventory(admin, shopId);
  const calendarSelect = "booking_id, room_type_id, room_id, hotel_bookings!inner ( id, guest_name, status, source, check_in_date, check_out_date )";
  const today = todayIso();
  const windowQuery = admin
    .from("hotel_booking_rooms")
    .select(calendarSelect)
    .eq("shop_id", shopId)
    .in("hotel_bookings.status", ["reserved", "checked_in", "checked_out"])
    .lt("hotel_bookings.check_in_date", end)
    .gt("hotel_bookings.check_out_date", from);
  // A guest still in the room past their check-out date keeps that room occupied.
  // Those whose date is inside the window are already in the first result.
  const overstayQuery = admin
    .from("hotel_booking_rooms")
    .select(calendarSelect)
    .eq("shop_id", shopId)
    .eq("hotel_bookings.status", "checked_in")
    .lte("hotel_bookings.check_out_date", from);
  const wantOverstays = from <= today && today < end;
  const [windowResult, overstayResult] = await Promise.all([windowQuery, wantOverstays ? overstayQuery : null]);
  const data = [...(windowResult.data ?? []), ...(overstayResult?.data ?? [])];

  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const barsByRoom: Record<string, CalendarBar[]> = {};
  const unassigned: Calendar["unassigned"] = [];
  const active: BookedRoomLite[] = [];
  for (const row of data ?? []) {
    const b = Array.isArray(row.hotel_bookings) ? row.hotel_bookings[0] : row.hotel_bookings;
    // Shown (and counted as occupied) through tonight while the guest is still in.
    const overstay = b.status === "checked_in" && b.check_out_date < today;
    const shownOut = overstay ? addDays(today, 1) : b.check_out_date;
    const bar: CalendarBar = { bookingId: b.id, guestName: b.guest_name, status: b.status, source: b.source, checkIn: b.check_in_date, checkOut: shownOut, overstay };
    if (b.status !== "checked_out") active.push({ bookingId: row.booking_id, roomTypeId: row.room_type_id, roomId: row.room_id, checkIn: b.check_in_date, checkOut: shownOut });
    if (row.room_id) (barsByRoom[row.room_id] ??= []).push(bar);
    else if (b.status !== "checked_out") unassigned.push({ ...bar, roomTypeName: typeName.get(row.room_type_id) ?? "Room" });
  }

  const roomsLite = toRoomLite(rooms);
  const freeByType: Record<string, number[]> = {};
  for (const t of types) freeByType[t.id] = [];
  for (const day of days) {
    const next = new Date(`${day}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const avail = availabilityByType({ rooms: roomsLite, booked: active, checkIn: day, checkOut: next.toISOString().slice(0, 10) });
    for (const t of types) freeByType[t.id].push(avail[t.id]?.available ?? 0);
  }
  return { days, rooms, types, barsByRoom, unassigned, freeByType };
}

export type GuestRegisterRow = {
  bookingNumber: string;
  guestName: string;
  phone: string | null;
  nationality: string;
  idProofType: string | null;
  idProofNumber: string | null;
  adults: number;
  children: number;
  rooms: string;
  checkIn: string;
  checkOut: string;
  status: BookingStatus;
};

export type HotelReport = {
  summary: ReturnType<typeof summarizeStays>;
  extrasRevenue: number;
  roomServiceRevenue: number;
  receivedByMethod: Record<string, number>;
  cancelled: number;
  noShows: number;
  register: GuestRegisterRow[];
};

/** Occupancy, revenue by source and the guest register for a period. */
export async function loadHotelReport(admin: Admin, shopId: string, from: string, to: string): Promise<HotelReport> {
  const startTs = new Date(`${from}T00:00:00+05:30`).toISOString();
  const endTs = new Date(`${to}T23:59:59.999+05:30`).toISOString();

  const [{ data: bookings }, { rooms }, { data: charges }, { data: orders }, { data: payments }, { data: closed }] = await Promise.all([
    admin
      .from("hotel_bookings")
      .select("id, booking_number, guest_name, guest_phone, nationality, id_proof_type, id_proof_number, adults, children, source, commission_percent, check_in_date, check_out_date, status")
      .eq("shop_id", shopId)
      .in("status", ["checked_in", "checked_out"])
      .lte("check_in_date", to)
      .gt("check_out_date", from)
      .order("check_in_date"),
    loadInventory(admin, shopId),
    admin.from("hotel_charges").select("amount").eq("shop_id", shopId).gte("created_at", startTs).lte("created_at", endTs),
    admin.from("restaurant_orders").select("total").eq("shop_id", shopId).not("hotel_booking_id", "is", null).eq("status", "settled").gte("settled_at", startTs).lte("settled_at", endTs),
    admin.from("hotel_payments").select("kind, payment_method, amount").eq("shop_id", shopId).gte("created_at", startTs).lte("created_at", endTs),
    admin.from("hotel_bookings").select("status").eq("shop_id", shopId).in("status", ["cancelled", "no_show"]).gte("cancelled_at", startTs).lte("cancelled_at", endTs),
  ]);

  const ids = (bookings ?? []).map((b) => b.id);
  const { data: brs } = ids.length ? await admin.from("hotel_booking_rooms").select("booking_id, room_id, rate_per_night").in("booking_id", ids) : { data: [] as { booking_id: string; room_id: string | null; rate_per_night: number }[] };
  const roomNumber = new Map(rooms.map((r) => [r.id, r.roomNumber]));

  const summary = summarizeStays({
    stays: (bookings ?? []).map((b) => ({
      bookingId: b.id,
      source: b.source,
      commissionPercent: Number(b.commission_percent),
      checkIn: b.check_in_date,
      checkOut: b.check_out_date,
      rates: (brs ?? []).filter((r) => r.booking_id === b.id).map((r) => Number(r.rate_per_night)),
    })),
    from,
    to,
    sellableRooms: rooms.filter((r) => !r.isBlocked).length,
  });

  const receivedByMethod: Record<string, number> = {};
  for (const p of payments ?? []) receivedByMethod[p.payment_method] = Math.round(((receivedByMethod[p.payment_method] ?? 0) + (p.kind === "refund" ? -Number(p.amount) : Number(p.amount))) * 100) / 100;

  return {
    summary,
    extrasRevenue: Math.round((charges ?? []).reduce((s, c) => s + Number(c.amount), 0) * 100) / 100,
    roomServiceRevenue: Math.round((orders ?? []).reduce((s, o) => s + Number(o.total), 0) * 100) / 100,
    receivedByMethod,
    cancelled: (closed ?? []).filter((c) => c.status === "cancelled").length,
    noShows: (closed ?? []).filter((c) => c.status === "no_show").length,
    register: (bookings ?? []).map((b) => ({
      bookingNumber: b.booking_number,
      guestName: b.guest_name,
      phone: b.guest_phone,
      nationality: b.nationality,
      idProofType: b.id_proof_type,
      idProofNumber: b.id_proof_number,
      adults: b.adults,
      children: b.children,
      rooms: (brs ?? []).filter((r) => r.booking_id === b.id).map((r) => (r.room_id ? roomNumber.get(r.room_id) ?? "" : "")).filter(Boolean).join(" "),
      checkIn: b.check_in_date,
      checkOut: b.check_out_date,
      status: b.status,
    })),
  };
}
