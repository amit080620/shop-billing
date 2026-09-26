import {
  addChargeAction,
  addRoomsAction,
  cancelBookingAction,
  chargeOrderToRoomAction,
  checkInAction,
  checkOutAction,
  createBookingAction,
  saveRoomTypeAction,
  setRoomStateAction,
  type NewBookingInput,
} from "@/lib/actions/hotel";
import { loadBookingDetail } from "@/lib/hotel/server";
import type { MealPlan } from "@/lib/hotel/constants";
import { addDays } from "@/lib/hotel/dates";
import { createNumberedTablesAction } from "@/lib/actions/restaurant";
import { fakePhone, isoAt, todayIst } from "../util";
import { insertCatalog, seedPettyCash, STANDARD_PETTY_CASH, type SeedCtx } from "./common";
import { RESTAURANT_MENU, takeOrder } from "./restaurant";

type RoomTypeIds = { standard: string; deluxe: string; suite: string };
type RoomIds = Record<string, string>;

async function setupRooms(ctx: SeedCtx): Promise<{ types: RoomTypeIds; rooms: RoomIds }> {
  const std = await saveRoomTypeAction({ name: "Standard", description: "Comfortable room with a queen bed", baseRate: 1500, maxAdults: 2, maxChildren: 1, amenities: "Fan, TV, hot water" });
  const dlx = await saveRoomTypeAction({ name: "Deluxe AC", description: "Air-conditioned, city view", baseRate: 2800, maxAdults: 3, maxChildren: 1, amenities: "AC, TV, hot water, mini fridge" });
  const ste = await saveRoomTypeAction({ name: "Suite", description: "Large suite with a sitting area", baseRate: 6500, maxAdults: 4, maxChildren: 2, amenities: "AC, TV, bathtub, balcony, breakfast lounge" });
  if (!std.id || !dlx.id || !ste.id) throw new Error("demo: hotel room types");
  await addRoomsAction({ roomTypeId: std.id, numbers: "101-106", floor: "1" });
  await addRoomsAction({ roomTypeId: dlx.id, numbers: "201-206", floor: "2" });
  await addRoomsAction({ roomTypeId: ste.id, numbers: "301-302", floor: "3" });
  const { data } = await ctx.admin.from("hotel_rooms").select("id, room_number").eq("shop_id", ctx.shopId);
  const rooms: RoomIds = {};
  for (const r of data ?? []) rooms[r.room_number] = r.id;
  return { types: { standard: std.id, deluxe: dlx.id, suite: ste.id }, rooms };
}

type Stay = {
  guest: string;
  phone: number;
  source: string;
  ref?: string;
  agent?: string;
  commission?: number;
  meal?: MealPlan;
  adults?: number;
  type: string;
  rate: number;
  room?: string;
  /** First night, in days from today (negative = already started). */
  start: number;
  nights: number;
  advance?: number;
  advanceMethod?: "cash" | "upi" | "card" | "online";
  extraRooms?: { type: string; rate: number; room?: string }[];
};

type Made = { id: string; checkIn: string; checkOut: string };

export async function seedHotel(ctx: SeedCtx): Promise<void> {
  const { types, rooms } = await setupRooms(ctx);
  const typeId = (k: string) => (types as Record<string, string>)[k];
  const today = todayIst();

  // The restaurant side: a menu, and a few dining tables next to the room tables.
  const menu = await insertCatalog(ctx, RESTAURANT_MENU, { track: false });
  await createNumberedTablesAction(4, "inside");
  const roomTableFor = async (roomNumber: string): Promise<string> => {
    const { data } = await ctx.admin.from("restaurant_tables").select("id").eq("shop_id", ctx.shopId).eq("hotel_room_id", rooms[roomNumber]).single();
    return data!.id;
  };
  const dish = (name: string) => menu.find((m) => m.name === name)!;

  const made: Made[] = [];

  /** Books the stay (the app only takes today-or-later dates), then moves it to its real dates. */
  const book = async (s: Stay): Promise<Made> => {
    const input: NewBookingInput = {
      guestName: s.guest,
      guestPhone: fakePhone(s.phone),
      adults: s.adults ?? 2,
      children: 0,
      source: s.source,
      sourceRef: s.ref,
      agentName: s.agent,
      commissionPercent: s.commission,
      mealPlan: s.meal ?? "EP",
      checkIn: today,
      checkOut: addDays(today, s.nights),
      rooms: [{ roomTypeId: typeId(s.type), roomId: s.room ? rooms[s.room] : null, ratePerNight: s.rate }, ...(s.extraRooms ?? []).map((r) => ({ roomTypeId: typeId(r.type), roomId: r.room ? rooms[r.room] : null, ratePerNight: r.rate }))],
      advanceAmount: s.advance,
      advanceMethod: s.advanceMethod ?? "upi",
    };
    const res = await createBookingAction(input);
    if (res.error || !res.bookingId) throw new Error(`demo: booking ${s.guest}: ${res.error}`);
    const checkIn = addDays(today, s.start);
    const checkOut = addDays(checkIn, s.nights);
    await ctx.admin.from("hotel_bookings").update({ check_in_date: checkIn, check_out_date: checkOut }).eq("id", res.bookingId);
    const m = { id: res.bookingId, checkIn, checkOut };
    made.push(m);
    return m;
  };

  const checkIn = async (m: Made, idType = "Aadhaar", idNumber = "4321 8765 1098") => {
    const r = await checkInAction({ bookingId: m.id, idProofType: idType, idProofNumber: idNumber, allowDirty: true });
    if (r.error) throw new Error(`demo: check-in: ${r.error}`);
  };

  const roomService = async (roomNumber: string, lines: [string, number][], chargeNow = true) => {
    const orderId = await takeOrder(ctx, await roomTableFor(roomNumber), lines.map(([n, q]) => ({ product: dish(n), qty: q })));
    if (chargeNow) {
      const r = await chargeOrderToRoomAction(orderId, 0);
      if (r.error) throw new Error(`demo: room service charge: ${r.error}`);
    }
    return orderId;
  };

  const checkOut = async (m: Made, opts: { discount?: number; leaveUnpaid?: number; method?: "cash" | "upi" | "card" } = {}) => {
    const detail = await loadBookingDetail(ctx.admin, ctx.shopId, m.id);
    if (!detail) throw new Error("demo: booking vanished");
    const due = Math.max(0, Math.round(detail.folio.balance));
    const pay = Math.max(0, due - (opts.leaveUnpaid ?? 0));
    const r = await checkOutAction({
      bookingId: m.id,
      discount: opts.discount ?? 0,
      payments: pay > 0 ? [{ method: opts.method ?? "upi", amount: pay }] : [],
      leaveUnpaid: !!opts.leaveUnpaid,
    });
    if (r.error) throw new Error(`demo: check-out: ${r.error}`);
    return r.billId;
  };

  // ── History: completed stays over the last three weeks ─────────────────
  const history: { s: Stay; unpaid?: number; discount?: number; charge?: [string, string, number, number]; food?: [string, number][]; room: string }[] = [
    { s: { guest: "Anita Deshpande", phone: 41, source: "walk_in", type: "standard", rate: 1500, start: -20, nights: 2 }, room: "101" },
    { s: { guest: "Suresh Menon", phone: 42, source: "makemytrip", ref: "MMT-71204", commission: 15, meal: "CP", type: "deluxe", rate: 2800, start: -19, nights: 3, advance: 2000 }, room: "202", charge: ["laundry", "Laundry", 400, 18] },
    { s: { guest: "Rahul Nair", phone: 43, source: "booking_com", ref: "BDC-2210987", commission: 18, type: "deluxe", rate: 2800, start: -17, nights: 1 }, room: "203" },
    { s: { guest: "Kavita Reddy", phone: 44, source: "phone", type: "suite", rate: 6500, meal: "MAP", start: -16, nights: 2, advance: 5000 }, room: "301", food: [["Paneer Butter Masala", 2], ["Butter Naan", 4], ["Gulab Jamun (2 pc)", 2]] },
    { s: { guest: "Mahesh Patil", phone: 45, source: "walk_in", type: "standard", rate: 1500, start: -15, nights: 1 }, room: "102" },
    { s: { guest: "TechNova Pvt Ltd - Ajay Rao", phone: 46, source: "corporate", type: "deluxe", rate: 2500, start: -14, nights: 4, advance: 3000, adults: 1 }, room: "204", food: [["Veg Biryani", 2], ["Masala Chai", 4]], unpaid: 2500 },
    { s: { guest: "Deepa Joshi", phone: 47, source: "goibibo", ref: "GI-55871", commission: 14, type: "standard", rate: 1400, start: -12, nights: 2 }, room: "103" },
    { s: { guest: "Vijay Kumar", phone: 48, source: "agent", agent: "Sunrise Travels", commission: 10, meal: "MAP", type: "deluxe", rate: 2600, start: -11, nights: 3, adults: 3 }, room: "205", charge: ["extra_bed", "Extra bed", 600, 12] },
    { s: { guest: "Neha Kulkarni", phone: 49, source: "website", type: "standard", rate: 1500, start: -9, nights: 2, advance: 1000 }, room: "104" },
    { s: { guest: "Farhan Ali", phone: 50, source: "agoda", ref: "AGD-903211", commission: 16, type: "deluxe", rate: 2800, start: -8, nights: 2 }, room: "201", food: [["Chicken Biryani", 2], ["Cold Coffee", 2]] },
    { s: { guest: "Sunita Bhosale", phone: 51, source: "makemytrip", ref: "MMT-71988", commission: 15, type: "suite", rate: 6000, meal: "CP", start: -7, nights: 2, advance: 4000 }, room: "302", discount: 500 },
    { s: { guest: "Ramesh Gawade", phone: 52, source: "walk_in", type: "standard", rate: 1500, start: -6, nights: 1 }, room: "105" },
    { s: { guest: "Pooja Sinha", phone: 53, source: "oyo", ref: "OYO-6650", commission: 20, type: "standard", rate: 1300, start: -5, nights: 2 }, room: "106" },
    { s: { guest: "Manish Agarwal", phone: 54, source: "phone", type: "deluxe", rate: 2800, meal: "CP", start: -4, nights: 2, advance: 1500 }, room: "202", food: [["Dal Makhani", 1], ["Tandoori Roti", 6], ["Mango Lassi", 2]] },
    { s: { guest: "Lata Shinde", phone: 55, source: "booking_com", ref: "BDC-2291800", commission: 18, type: "deluxe", rate: 2900, start: -3, nights: 1 }, room: "203" },
  ];
  for (const h of history) {
    const m = await book({ ...h.s, room: h.room });
    await checkIn(m);
    if (h.charge) await addChargeAction({ bookingId: m.id, kind: h.charge[0], description: h.charge[1], amount: h.charge[2], gstPercent: h.charge[3] });
    if (h.food) await roomService(h.room, h.food);
    await checkOut(m, { discount: h.discount, leaveUnpaid: h.unpaid, method: ctx.random.pick(["upi", "cash", "card"] as const) });
  }

  // A booking that was cancelled (advance partly kept) and a no-show.
  const cancelled = await book({ guest: "Rohini Iyer", phone: 60, source: "booking_com", ref: "BDC-2301122", commission: 18, type: "deluxe", rate: 2800, start: 2, nights: 2, advance: 3000 });
  await cancelBookingAction({ bookingId: cancelled.id, reason: "Guest changed plans", outcome: "cancelled", keepAmount: 1000, refundMethod: "upi" });
  const noShow = await book({ guest: "Sameer Qureshi", phone: 61, source: "goibibo", ref: "GI-56200", commission: 14, type: "standard", rate: 1500, start: -2, nights: 1, advance: 500 });
  await cancelBookingAction({ bookingId: noShow.id, reason: "Did not arrive", outcome: "no_show", keepAmount: 500 });

  // ── Right now: who is in the hotel ────────────────────────────────────
  const priya = await book({ guest: "Priya Sharma", phone: 70, source: "makemytrip", ref: "MMT-72455", commission: 15, meal: "CP", type: "deluxe", rate: 2800, room: "201", start: -1, nights: 3, advance: 2000 });
  await checkIn(priya, "Passport", "P1234567");
  await roomService("201", [["Paneer Tikka", 1], ["Veg Biryani", 1], ["Masala Chai", 2]]);
  await addChargeAction({ bookingId: priya.id, kind: "laundry", description: "Laundry", amount: 350, gstPercent: 18 });

  const kumar = await book({ guest: "Mr. Kumar", phone: 71, source: "phone", type: "standard", rate: 1500, room: "104", start: -3, nights: 2, advance: 1000 });
  await checkIn(kumar); // stays on past his check-out date: an overstay

  const shreya = await book({ guest: "Shreya Kapoor", phone: 72, source: "booking_com", ref: "BDC-2334410", commission: 18, type: "deluxe", rate: 2800, room: "203", start: -2, nights: 2, advance: 2800 });
  await checkIn(shreya);
  await roomService("203", [["Butter Chicken", 1], ["Garlic Naan", 2], ["Fresh Lime Soda", 2]]);

  const walkin = await book({ guest: "Arjun Mehta", phone: 73, source: "walk_in", type: "standard", rate: 1500, room: "102", start: 0, nights: 2, advance: 1500, advanceMethod: "cash" });
  await checkIn(walkin, "Driving licence", "MH12 20200012345");
  // Ordered just now — still on the kitchen screen.
  await roomService("102", [["Chicken Biryani", 1], ["Masala Chai", 2]]);

  const family = await book({ guest: "Joshi Family (3 rooms)", phone: 74, source: "agent", agent: "Sunrise Travels", commission: 10, meal: "MAP", adults: 6, type: "deluxe", rate: 2600, room: "204", start: -1, nights: 3, advance: 6000, extraRooms: [{ type: "deluxe", rate: 2600, room: "205" }, { type: "standard", rate: 1400, room: "103" }] });
  await checkIn(family, "Aadhaar", "5566 7788 9900");

  // Arriving today, and one who should have arrived yesterday.
  await book({ guest: "Ishaan Malhotra", phone: 80, source: "goibibo", ref: "GI-56488", commission: 14, type: "suite", rate: 6500, meal: "CP", start: 0, nights: 2, advance: 2000 });
  await book({ guest: "Tanvi Pawar", phone: 81, source: "phone", type: "standard", rate: 1500, room: "105", start: 0, nights: 1 });
  await book({ guest: "Rajiv Saxena", phone: 82, source: "agent", agent: "City Tours & Travels", commission: 12, type: "deluxe", rate: 2700, start: -1, nights: 2, advance: 1000 });

  // Coming up.
  await book({ guest: "Wedding party - Bhosale", phone: 83, source: "phone", adults: 8, type: "deluxe", rate: 2500, start: 5, nights: 2, advance: 10000, extraRooms: [{ type: "deluxe", rate: 2500 }, { type: "standard", rate: 1400 }, { type: "standard", rate: 1400 }] });
  await book({ guest: "Nikhil Jain", phone: 84, source: "makemytrip", ref: "MMT-73010", commission: 15, meal: "CP", type: "suite", rate: 6500, start: 3, nights: 1 });
  await book({ guest: "Aditi Rao", phone: 85, source: "website", type: "deluxe", rate: 2800, start: 7, nights: 3, advance: 2000 });
  await book({ guest: "Vikas Choudhary", phone: 86, source: "corporate", type: "standard", rate: 1400, start: 9, nights: 4 });

  // Rooms: one needs cleaning (guest just left), one is out of service.
  await setRoomStateAction({ roomId: rooms["106"], housekeeping: "dirty" });
  await setRoomStateAction({ roomId: rooms["206"], blocked: true, reason: "AC repair" });

  // Backdate what the app stamped "now" so the history reads as history.
  const dayDiff = (from: string, to: string) => Math.round((new Date(`${from}T00:00:00Z`).getTime() - new Date(`${to}T00:00:00Z`).getTime()) / 86400000);
  for (const [idx, m] of made.entries()) {
    const startAgo = dayDiff(today, m.checkIn); // > 0: started in the past
    const outAgo = Math.max(0, dayDiff(today, m.checkOut));
    const { data: b } = await ctx.admin.from("hotel_bookings").select("status, bill_id").eq("id", m.id).single();
    const closedOut = b?.status === "cancelled" || b?.status === "no_show";
    const walkInToday = b?.status === "checked_in" && startAgo === 0;
    // When the booking was made, and (if it was called off) when.
    const madeAgo = closedOut ? (b?.status === "cancelled" ? 8 : 6) : startAgo > 0 ? startAgo + 3 : walkInToday ? 0 : 1 + (idx % 3);
    const calledOffAgo = b?.status === "cancelled" ? 5 : 2;
    if (!walkInToday) {
      const patch: { created_at: string; checked_in_at?: string; checked_out_at?: string; cancelled_at?: string } = { created_at: isoAt(madeAgo, 12) };
      if (b?.status === "checked_in" || b?.status === "checked_out") patch.checked_in_at = isoAt(Math.max(0, startAgo), 14, 10);
      if (b?.status === "checked_out") patch.checked_out_at = isoAt(outAgo, 11, 5);
      if (closedOut) patch.cancelled_at = isoAt(calledOffAgo, 10);
      await ctx.admin.from("hotel_bookings").update(patch).eq("id", m.id);
      const { data: pays } = await ctx.admin.from("hotel_payments").select("id, kind").eq("booking_id", m.id);
      for (const pay of pays ?? []) {
        const at = pay.kind === "advance" ? isoAt(madeAgo, 12, 30) : closedOut ? isoAt(calledOffAgo, 10, 20) : isoAt(outAgo, 11, 15);
        await ctx.admin.from("hotel_payments").update({ created_at: at }).eq("id", pay.id);
      }
      if (b?.bill_id) await ctx.admin.from("bills").update({ created_at: closedOut ? isoAt(calledOffAgo, 10, 25) : isoAt(outAgo, 11, 10) }).eq("id", b.bill_id);
    }
    await ctx.admin.from("hotel_charges").update({ created_at: isoAt(Math.max(0, startAgo - 1), 19) }).eq("booking_id", m.id);
    const { data: orders } = await ctx.admin.from("restaurant_orders").select("id").eq("hotel_booking_id", m.id).order("created_at");
    for (const [i, o] of (orders ?? []).entries()) {
      const at = isoAt(Math.max(0, startAgo), 20 + Math.min(i, 2), 5 + i * 7);
      // Today's room orders keep their real time so the kitchen screen shows them as fresh.
      if (startAgo > 0) {
        await ctx.admin.from("restaurant_orders").update({ created_at: at, settled_at: at, first_ready_at: at, served_at: at }).eq("id", o.id);
        await ctx.admin.from("restaurant_order_items").update({ created_at: at, status: "served" }).eq("order_id", o.id);
      }
    }
  }
  // Housekeeping: every room is clean except two that were just vacated.
  await ctx.admin.from("hotel_rooms").update({ housekeeping: "clean" }).eq("shop_id", ctx.shopId);
  await ctx.admin.from("hotel_rooms").update({ housekeeping: "dirty" }).eq("shop_id", ctx.shopId).in("room_number", ["106", "202"]);

  await seedPettyCash(ctx, [
    { description: "Linen laundry (bulk)", amount: 3200, category: "Housekeeping", daysAgo: 4 },
    { description: "Room amenities restock", amount: 2750, category: "Housekeeping", daysAgo: 8 },
    ...STANDARD_PETTY_CASH.slice(0, 3),
  ]);
}
