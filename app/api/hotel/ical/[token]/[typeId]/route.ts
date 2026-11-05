import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { todayIso } from "@/lib/dateHelpers";
import { addDays } from "@/lib/hotel/dates";
import { availabilityByType } from "@/lib/hotel/availability";
import { buildIcal, closedRanges } from "@/lib/hotel/ical";
import { hotelForToken } from "@/lib/hotel/publicStay";
import { loadActiveBookedRooms, loadInventory, toRoomLite } from "@/lib/hotel/server";
import { checkRateLimitAsync } from "@/lib/rateLimit";

const DAYS = 365;

/** The dates a room type has no room left, for a booking site to read. Only dates: no guest's details.
 * Dates sold by that same site count too; sites expect that and treat their own stays as their own. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; typeId: string }> }) {
  const { token, typeId } = await params;
  const name = typeId.replace(/\.ics$/, "");
  if (!(await checkRateLimitAsync(`hotel-ical:${token}:${name}`, 60, 60 * 60 * 1000))) return new NextResponse("Too many requests", { status: 429 });
  const admin = createSupabaseAdminClient();
  const hotel = await hotelForToken(admin, token);
  if (!hotel) return new NextResponse("Not found", { status: 404 });
  const [{ types, rooms }, booked] = await Promise.all([loadInventory(admin, hotel.shopId), loadActiveBookedRooms(admin, hotel.shopId)]);
  const type = types.find((t) => t.id === name);
  if (!type) return new NextResponse("Not found", { status: 404 });
  const lite = toRoomLite(rooms);
  const from = todayIso();
  const ranges = closedRanges({ from, days: DAYS, isFull: (date) => (availabilityByType({ rooms: lite, booked, checkIn: date, checkOut: addDays(date, 1) })[name]?.available ?? 0) === 0 });
  const body = buildIcal({ name: `${hotel.name} - ${type.name}`, domain: "theray.app", ranges, now: new Date() });
  return new NextResponse(body, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `inline; filename="${name}.ics"`, "cache-control": "private, max-age=900" } });
}
