import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { AttendanceRow } from "./AttendanceRow";
import { CheckInForm } from "./CheckInForm";

export default async function GymAttendancePage() {
  const session = await requireSession();
  const { lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [{ data: todayAttendance }, { data: members }] = await Promise.all([
    admin
      .from("gym_attendance")
      .select("id, member_id, checked_in_at, checked_out_at, customers ( name, phone )")
      .eq("shop_id", session.shopId)
      .gte("checked_in_at", startOfToday.toISOString())
      .order("checked_in_at", { ascending: false }),
    admin.from("customers").select("id, name, phone").eq("shop_id", session.shopId).order("name"),
  ]);

  const currentlyIn = (todayAttendance ?? []).filter((a) => !a.checked_out_at).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Attendance"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 12l2 2 4-4" />
            <circle cx="12" cy="12" r="10" />
          </svg>
        }
      />
      <Link href="/gym/members" className="text-sm text-muted">
        ← Members
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-surface p-3.5 text-center shadow-sm">
          <p className="text-xs text-muted">Currently in gym</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{currentlyIn}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3.5 text-center shadow-sm">
          <p className="text-xs text-muted">Today&apos;s check-ins</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{todayAttendance?.length ?? 0}</p>
        </div>
      </div>

      <CheckInForm lang={lang} members={members ?? []} />

      {(!todayAttendance || todayAttendance.length === 0) ? (
        <EmptyState text="No check-ins yet today." />
      ) : (
        <ul className="flex flex-col gap-2">
          {todayAttendance.map((a) => {
            const customer = Array.isArray(a.customers) ? a.customers[0] : (a.customers as { name: string; phone: string } | null);
            return (
              <AttendanceRow
                key={a.id}
                attendance={{
                  id: a.id,
                  memberName: customer?.name ?? "Member",
                  checkedInAt: a.checked_in_at,
                  checkedOutAt: a.checked_out_at,
                }}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
