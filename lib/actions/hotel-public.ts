"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "../supabase/admin";
import { checkRateLimitAsync } from "../rateLimit";
import { isIsoDate, nightsBetween } from "../hotel/dates";
import { loose } from "../hotel/ops";
import { hotelForToken, stayDateRange, stayOptions, type StayOption } from "../hotel/publicStay";

const validStay = (checkIn: string, checkOut: string) => {
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut) || checkOut <= checkIn) return "Check-out must be after check-in.";
  const { min, max } = stayDateRange();
  if (checkIn < min || checkIn > max) return "Choose a date from today up to a year ahead.";
  if (nightsBetween(checkIn, checkOut) > 60) return "For a stay this long, please call the hotel.";
  return null;
};

async function callerKey() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

export async function stayQuoteAction(token: string, checkIn: string, checkOut: string): Promise<{ error?: string; options?: StayOption[] }> {
  const problem = validStay(checkIn, checkOut);
  if (problem) return { error: problem };
  if (!(await checkRateLimitAsync(`stay-quote:${token}:${await callerKey()}`, 60, 10 * 60 * 1000))) return { error: "Too many searches. Please wait a few minutes." };
  const admin = createSupabaseAdminClient();
  const hotel = await hotelForToken(admin, token);
  if (!hotel) return { error: "This booking page isn't available." };
  return { options: await stayOptions(admin, hotel.shopId, checkIn, checkOut) };
}

export type StayRequestInput = { roomTypeId: string; rooms: number; checkIn: string; checkOut: string; guestName: string; guestPhone: string; guestEmail: string; adults: number; children: number; message: string; website: string };

/** A guest's request from the hotel's page. It holds no room: the desk accepts it as a booking. The
 * price and availability are worked out here again, whatever the page sent. */
export async function requestStayAction(token: string, input: StayRequestInput): Promise<{ error?: string; rate?: number }> {
  // The hidden field only a form-filling bot fills in. It sees a normal success.
  if (input.website) return { rate: 0 };
  const problem = validStay(input.checkIn, input.checkOut);
  if (problem) return { error: problem };
  const guestName = input.guestName?.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!guestName) return { error: "Enter your name." };
  const digits = (input.guestPhone ?? "").replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return { error: "Enter a 10-digit mobile number." };
  const rooms = Math.floor(Number(input.rooms));
  if (!(rooms >= 1 && rooms <= 5)) return { error: "Choose between 1 and 5 rooms." };
  const adults = Math.floor(Number(input.adults));
  const children = Math.floor(Number(input.children)) || 0;
  if (!(adults >= 1 && adults <= 30) || children < 0 || children > 30) return { error: "Check the number of guests." };
  if (!(await checkRateLimitAsync(`stay-request:${token}:${digits}`, 5, 60 * 60 * 1000)) || !(await checkRateLimitAsync(`stay-request-ip:${token}:${await callerKey()}`, 10, 60 * 60 * 1000))) {
    return { error: "Too many requests. Please call the hotel." };
  }
  const admin = createSupabaseAdminClient();
  const hotel = await hotelForToken(admin, token);
  if (!hotel) return { error: "This booking page isn't available." };
  const option = (await stayOptions(admin, hotel.shopId, input.checkIn, input.checkOut)).find((o) => o.id === input.roomTypeId);
  if (!option) return { error: "That room isn't available." };
  if (option.stopReason) return { error: option.stopReason };
  if (option.rooms < rooms) return { error: option.rooms === 0 ? "That room just sold out for these dates." : `Only ${option.rooms} left for these dates.` };
  const { error } = await loose(admin).from("hotel_booking_requests").insert({
    shop_id: hotel.shopId,
    room_type_id: input.roomTypeId,
    rooms,
    guest_name: guestName,
    guest_phone: digits,
    guest_email: input.guestEmail?.trim().slice(0, 120) || null,
    adults,
    children,
    check_in_date: input.checkIn,
    check_out_date: input.checkOut,
    quoted_rate: option.rate,
    message: input.message?.trim().slice(0, 500) || null,
  });
  if (error) return { error: "Could not send your request. Please try again." };
  revalidatePath("/hotel");
  revalidatePath("/hotel/online");
  return { rate: option.rate };
}
