import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { hasPermission, requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { addDaysIso, formatIsoDate, todayIso } from "@/lib/dateHelpers";
import { loadWorkers, payrollReady } from "@/lib/payrollData";
import { StaffTabs } from "./StaffTabs";
import { AttendanceClient } from "./AttendanceClient";

export default async function StaffAttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await requireSession();
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  const today = todayIso();
  const { date: dateParam } = await searchParams;
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam <= today ? dateParam : today;

  const header = (
    <>
      <BackLink fallback="/more" />
      <PageHeader title={t("Staff attendance & salary")} icon={<CalendarCheck size={18} strokeWidth={1.8} />} />
    </>
  );
  if (!(await payrollReady(admin))) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("Staff attendance needs a one-time database update (migration 0046).")}</p>
      </div>
    );
  }
  if (!hasPermission(session, "manage_staff")) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("Only the owner, or staff allowed to manage staff, can see this.")}</p>
      </div>
    );
  }

  const workers = await loadWorkers(admin, session.shopId);
  const { data: marks } = await admin.from("worker_attendance").select("worker_id, status").eq("shop_id", session.shopId).eq("work_date", date);

  return (
    <div className="flex flex-col gap-4">
      {header}
      <StaffTabs active="attendance" t={t} />
      <div className="flex items-center justify-between gap-2">
        <Link href={`/staff-attendance?date=${addDaysIso(date, -1)}`} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted">
          ←
        </Link>
        <p className="text-sm font-semibold text-foreground">
          {formatIsoDate(date)}
          {date === today ? ` · ${t("Today")}` : ""}
        </p>
        {date < today ? (
          <Link href={`/staff-attendance?date=${addDaysIso(date, 1)}`} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted">
            →
          </Link>
        ) : (
          <span className="w-10" />
        )}
      </div>
      {workers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm text-muted">{t("No one on the list yet.")}</p>
          <Link href="/staff-attendance/people" className="btn-primary-sm mt-3 inline-block">
            {t("+ Add people")}
          </Link>
        </div>
      ) : (
        <AttendanceClient
          date={date}
          workers={workers.map((w) => ({ id: w.id, name: w.name, designation: w.designation }))}
          marks={Object.fromEntries((marks ?? []).map((m) => [m.worker_id, m.status]))}
        />
      )}
    </div>
  );
}
