import { CalendarPlus } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { todayIso } from "@/lib/dateHelpers";
import { isIsoDate } from "@/lib/hotel/dates";
import { hotelSchemaReady } from "@/lib/hotel/server";
import { hotelOpsReady, loadAccounts, loose } from "@/lib/hotel/ops";
import { isModuleEnabled } from "@/lib/modules";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { HotelSetupNotice } from "../../HotelSetupNotice";
import { NewBookingClient } from "./NewBookingClient";

export default async function NewBookingPage({ searchParams }: { searchParams: Promise<{ room?: string; in?: string; request?: string }> }) {
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (!(await hotelSchemaReady(admin))) return <HotelSetupNotice />;

  const today = todayIso();
  const { room, in: inParam, request } = await searchParams;
  const opsReady = await hotelOpsReady(admin);
  // Accepting a guest's request from the booking page: the form starts filled in.
  const { data: asked } = request && opsReady ? await loose(admin).from("hotel_booking_requests").select("*").eq("id", request).eq("shop_id", session.shopId).eq("status", "new").maybeSingle() : { data: null };
  const askedIn = asked && asked.check_in_date >= today ? (asked.check_in_date as string) : null;
  const initialCheckIn = askedIn ?? (inParam && isIsoDate(inParam) && inParam >= today ? inParam : today);
  const accounts = opsReady && isModuleEnabled(session.enabledModules, "hotel_operations") ? await loadAccounts(admin, session.shopId) : [];

  let presetRoom: { id: string; roomTypeId: string } | null = null;
  if (room) {
    const { data } = await admin.from("hotel_rooms").select("id, room_type_id").eq("id", room).eq("shop_id", session.shopId).eq("is_active", true).maybeSingle();
    if (data) presetRoom = { id: data.id, roomTypeId: data.room_type_id };
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/hotel/bookings" />
      <PageHeader title={t("New booking")} icon={<CalendarPlus size={18} strokeWidth={1.8} />} />
      <NewBookingClient
        today={today}
        initialCheckIn={initialCheckIn}
        presetRoom={presetRoom}
        accounts={accounts}
        request={
          asked && askedIn
            ? { id: asked.id, guestName: asked.guest_name, phone: asked.guest_phone, email: asked.guest_email ?? "", adults: asked.adults, children: asked.children, checkOut: asked.check_out_date, roomTypeId: asked.room_type_id, rooms: asked.rooms, message: asked.message ?? "" }
            : null
        }
      />
    </div>
  );
}
