import { notFound } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { requireSession, hasPermission } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { freeRooms } from "@/lib/hotel/availability";
import { hotelSchemaReady, loadActiveBookedRooms, loadBookingDetail, loadInventory, toRoomLite } from "@/lib/hotel/server";
import { BackLink } from "@/app/components/BackLink";
import { PageHeader } from "@/app/components/PageHeader";
import { HotelSetupNotice } from "../../HotelSetupNotice";
import { BookingClient } from "./BookingClient";

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  if (!(await hotelSchemaReady(admin))) return <HotelSetupNotice />;

  const booking = await loadBookingDetail(admin, session.shopId, id);
  if (!booking) notFound();

  const open = booking.status === "reserved" || booking.status === "checked_in";
  const [{ rooms }, booked] = open ? await Promise.all([loadInventory(admin, session.shopId), loadActiveBookedRooms(admin, session.shopId)]) : [{ rooms: [] }, []];
  const roomsLite = toRoomLite(rooms);
  const numberById = new Map(rooms.map((r) => [r.id, r.roomNumber]));
  const freeByBookingRoom: Record<string, { id: string; roomNumber: string; dirty: boolean }[]> = {};
  if (open) {
    for (const br of booking.rooms) {
      freeByBookingRoom[br.id] = freeRooms({ rooms: roomsLite, booked, checkIn: booking.checkIn, checkOut: booking.checkOut, excludeBookingId: booking.id, roomTypeId: br.roomTypeId }).map((r) => ({
        id: r.id,
        roomNumber: numberById.get(r.id) ?? "",
        dirty: rooms.find((x) => x.id === r.id)?.housekeeping === "dirty",
      }));
    }
  }

  const roomIds = booking.rooms.map((r) => r.roomId).filter(Boolean) as string[];
  const { data: tables } = roomIds.length ? await admin.from("restaurant_tables").select("id, hotel_room_id").eq("shop_id", session.shopId).eq("is_deleted", false).in("hotel_room_id", roomIds) : { data: [] as { id: string; hotel_room_id: string | null }[] };
  const tableByRoom: Record<string, string> = {};
  for (const tb of tables ?? []) if (tb.hotel_room_id) tableByRoom[tb.hotel_room_id] = tb.id;

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/hotel/bookings" />
      <PageHeader title={booking.guestName} subtitle={booking.bookingNumber} icon={<ClipboardList size={18} strokeWidth={1.8} />} />
      <BookingClient
        booking={booking}
        freeByBookingRoom={freeByBookingRoom}
        tableByRoom={tableByRoom}
        shopName={session.shopName}
        canManage={session.role === "owner" || session.role === "manager"}
        canDiscount={hasPermission(session, "give_discounts")}
      />
    </div>
  );
}
