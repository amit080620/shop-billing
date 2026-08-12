import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { ClassesClient } from "./ClassesClient";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";

export default async function GymClassesPage() {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "class_schedule")) return <ModuleBlocked moduleKey="class_schedule" />;
  const { lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const todayIso = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
  const todayDow = new Date().getDay();

  const [{ data: classes }, { data: staff }, { data: members }, { data: todayBookings }] = await Promise.all([
    admin.from("gym_classes").select("id, name, trainer_id, day_of_week, start_time, duration_minutes, capacity, is_active, staff:trainer_id ( name )").eq("shop_id", session.shopId).order("day_of_week").order("start_time"),
    admin.from("staff").select("id, name").eq("shop_id", session.shopId).neq("role", "owner"),
    admin.from("customers").select("id, name, phone").eq("shop_id", session.shopId).order("name"),
    admin.from("gym_class_bookings").select("id, class_id, member_id, class_date, customers ( name )").eq("class_date", todayIso),
  ]);

  const bookingsByClass = new Map<string, { id: string; memberId: string; memberName: string }[]>();
  for (const b of todayBookings ?? []) {
    const customer = Array.isArray(b.customers) ? b.customers[0] : (b.customers as { name: string } | null);
    const list = bookingsByClass.get(b.class_id) ?? [];
    list.push({ id: b.id, memberId: b.member_id, memberName: customer?.name ?? "Member" });
    bookingsByClass.set(b.class_id, list);
  }

  return (
    <ClassesClient
      lang={lang}
      isOwner={session.role === "owner"}
      todayIso={todayIso}
      todayDow={todayDow}
      trainers={staff ?? []}
      members={members ?? []}
      classes={(classes ?? []).map((c) => {
        const trainer = Array.isArray(c.staff) ? c.staff[0] : (c.staff as { name: string } | null);
        return {
          id: c.id,
          name: c.name,
          trainerName: trainer?.name ?? null,
          dayOfWeek: c.day_of_week,
          startTime: c.start_time,
          durationMinutes: c.duration_minutes,
          capacity: c.capacity,
          isActive: c.is_active,
          todayBookings: bookingsByClass.get(c.id) ?? [],
        };
      })}
    />
  );
}
