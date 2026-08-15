import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { BookingSettingsClient } from "./BookingSettingsClient";

export default async function BookingSettingsPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: settings } = await admin
    .from("booking_settings")
    .select("slot_duration_minutes, working_hours, is_public_booking_enabled, public_token, doctor_name, doctor_qualifications, doctor_photo_url, unavailable_dates")
    .eq("shop_id", session.shopId)
    .maybeSingle();

  return (
    <BookingSettingsClient
      slotDurationMinutes={settings?.slot_duration_minutes ?? 20}
      workingHours={settings?.working_hours ?? {}}
      isPublicBookingEnabled={settings?.is_public_booking_enabled ?? false}
      publicToken={settings?.public_token ?? null}
      businessType={session.businessType}
      doctorName={settings?.doctor_name ?? ""}
      doctorQualifications={settings?.doctor_qualifications ?? ""}
      doctorPhotoUrl={settings?.doctor_photo_url ?? null}
      unavailableDates={settings?.unavailable_dates ?? []}
    />
  );
}
