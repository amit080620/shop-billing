import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { computeAvailableSlots, dayKeyFor } from "@/lib/booking";
import { PublicBookingClient } from "./PublicBookingClient";

const DAYS_AHEAD = 7;

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();

  const { data: settings } = await admin
    .from("booking_settings")
    .select("shop_id, slot_duration_minutes, working_hours, is_public_booking_enabled")
    .eq("public_token", token)
    .maybeSingle();

  if (!settings || !settings.is_public_booking_enabled) notFound();

  const { data: shop } = await admin.from("shops").select("name, business_type, logo_url").eq("id", settings.shop_id).single();
  if (!shop) notFound();

  const isClinic = shop.business_type === "clinic";
  const table = isClinic ? "clinic_appointments" : "appointments";
  const dateFrom = new Date();
  const dateTo = new Date();
  dateTo.setDate(dateTo.getDate() + DAYS_AHEAD);

  const { data: existingBookings } = await admin
    .from(table)
    .select("appointment_date, appointment_time")
    .eq("shop_id", settings.shop_id)
    .gte("appointment_date", dateFrom.toISOString().slice(0, 10))
    .lte("appointment_date", dateTo.toISOString().slice(0, 10))
    .not("status", "in", "(cancelled,no_show)");

  const bookedByDate = new Map<string, string[]>();
  for (const b of existingBookings ?? []) {
    const list = bookedByDate.get(b.appointment_date) ?? [];
    list.push(b.appointment_time);
    bookedByDate.set(b.appointment_date, list);
  }

  const workingHours = (settings.working_hours as Record<string, { start: string; end: string }[]>) ?? {};

  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const dateIso = date.toISOString().slice(0, 10);
    const dayKey = dayKeyFor(date);
    const ranges = workingHours[dayKey] ?? [];
    const slots = computeAvailableSlots(ranges, settings.slot_duration_minutes, bookedByDate.get(dateIso) ?? []);
    return {
      date: dateIso,
      label: date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
      slots,
    };
  });

  return (
    <PublicBookingClient
      token={token}
      shopName={shop.name}
      shopLogoUrl={shop.logo_url}
      isClinic={isClinic}
      days={days}
    />
  );
}
