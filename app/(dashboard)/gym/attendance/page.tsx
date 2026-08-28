import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { AttendanceRow } from "./AttendanceRow";
import { CheckInForm } from "./CheckInForm";
import { ClipboardCheck, Smartphone } from "lucide-react";

export default async function GymAttendancePage() {
  const session = await requireSession();
  const { lang } = await getTranslator();
  const admin = createSupabaseAdminClient();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const last30Days = new Date();
  last30Days.setDate(last30Days.getDate() - 30);

  const [{ data: todayAttendance }, { data: members }, { data: recentCheckIns }] = await Promise.all([
    admin
      .from("gym_attendance")
      .select("id, member_id, checked_in_at, checked_out_at, customers ( name, phone )")
      .eq("shop_id", session.shopId)
      .gte("checked_in_at", startOfToday.toISOString())
      .order("checked_in_at", { ascending: false }),
    admin.from("customers").select("id, name, phone").eq("shop_id", session.shopId).order("name"),
    admin.from("gym_attendance").select("checked_in_at").eq("shop_id", session.shopId).gte("checked_in_at", last30Days.toISOString()),
  ]);

  const hourCounts = new Array(24).fill(0);
  for (const row of recentCheckIns ?? []) {
    const hour = new Date(row.checked_in_at).getHours();
    hourCounts[hour]++;
  }
  const maxHourCount = Math.max(...hourCounts, 1);
  const peakHour = hourCounts.indexOf(maxHourCount);

  const currentlyIn = (todayAttendance ?? []).filter((a) => !a.checked_out_at).length;

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Attendance"
        icon={<ClipboardCheck size={18} strokeWidth={1.8} />}
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

      {(recentCheckIns?.length ?? 0) >= 5 && (
        <div className="rounded-xl border border-border bg-surface p-3.5 shadow-sm">
          <p className="text-xs font-medium text-muted">Busiest hour (last 30 days)</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">
            {peakHour === 0 ? "12 AM" : peakHour < 12 ? `${peakHour} AM` : peakHour === 12 ? "12 PM" : `${peakHour - 12} PM`} — {maxHourCount} check-ins
          </p>
          <div className="mt-2 flex h-16 items-end gap-[2px]">
            {hourCounts.map((count, hour) => (
              <div
                key={hour}
                className={`flex-1 rounded-t ${hour === peakHour ? "bg-brand" : "bg-brand-soft"}`}
                style={{ height: `${Math.max(6, (count / maxHourCount) * 100)}%` }}
                title={`${hour}:00 — ${count} check-ins`}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-muted">
            <span>12 AM</span>
            <span>12 PM</span>
            <span>11 PM</span>
          </div>
        </div>
      )}

      <CheckInForm lang={lang} members={members ?? []} />

      <Link href="/gym/kiosk-settings" className="flex items-center justify-between rounded-xl border border-dashed border-brand bg-brand-soft px-4 py-3 text-sm">
        <span className="flex items-center gap-1.5 text-brand-text"><Smartphone size={14} /> Set up self check-in kiosk — members check themselves in</span>
        <span className="text-brand-text">→</span>
      </Link>

      {(!todayAttendance || todayAttendance.length === 0) ? (
        <EmptyState text="No check-ins yet today." />
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
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
