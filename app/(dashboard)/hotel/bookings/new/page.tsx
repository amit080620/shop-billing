import { CalendarPlus } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { todayIso } from "@/lib/dateHelpers";
import { isIsoDate } from "@/lib/hotel/dates";
import { hotelSchemaReady } from "@/lib/hotel/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { HotelSetupNotice } from "../../HotelSetupNotice";
import { NewBookingClient } from "./NewBookingClient";

export default async function NewBookingPage({ searchParams }: { searchParams: Promise<{ room?: string; in?: string }> }) {
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  if (!(await hotelSchemaReady(admin))) return <HotelSetupNotice />;

  const today = todayIso();
  const { room, in: inParam } = await searchParams;
  const initialCheckIn = inParam && isIsoDate(inParam) && inParam >= today ? inParam : today;

  let presetRoom: { id: string; roomTypeId: string } | null = null;
  if (room) {
    const { data } = await admin.from("hotel_rooms").select("id, room_type_id").eq("id", room).eq("shop_id", session.shopId).eq("is_active", true).maybeSingle();
    if (data) presetRoom = { id: data.id, roomTypeId: data.room_type_id };
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/hotel/bookings" />
      <PageHeader title={t("New booking")} icon={<CalendarPlus size={18} strokeWidth={1.8} />} />
      <NewBookingClient today={today} initialCheckIn={initialCheckIn} presetRoom={presetRoom} />
    </div>
  );
}
