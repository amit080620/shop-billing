import Link from "next/link";
import { Wallet } from "lucide-react";
import { hasPermission, requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { MONTHS, todayIso } from "@/lib/dateHelpers";
import { formatMoney } from "@/lib/format";
import { loadMonthSheet, payrollReady } from "@/lib/payrollData";
import { StaffTabs } from "../StaffTabs";
import { SalaryClient } from "./SalaryClient";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";

const shift = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export default async function StaffSalaryPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "staff_payroll")) return <ModuleBlocked moduleKey="staff_payroll" />;
  const { t } = await getTranslator();
  const admin = createSupabaseAdminClient();
  const current = todayIso().slice(0, 7);
  const { month: monthParam } = await searchParams;
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) && monthParam <= current ? monthParam : current;
  const label = `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

  const ok = (await payrollReady(admin)) && hasPermission(session, "manage_staff");
  const rows = ok ? await loadMonthSheet(admin, session.shopId, month, isModuleEnabled(session.enabledModules, "stylist_commission")) : [];
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/staff-attendance" />
      <PageHeader title={t("Staff attendance & salary")} icon={<Wallet size={18} strokeWidth={1.8} />} />
      {!ok ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("Only the owner, or staff allowed to manage staff, can see this.")}</p>
      ) : (
        <>
          <StaffTabs active="salary" t={t} />
          <div className="flex items-center justify-between gap-2">
            <Link href={`/staff-attendance/salary?month=${shift(month, -1)}`} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted">
              ←
            </Link>
            <p className="text-sm font-semibold text-foreground">{label}</p>
            {month < current ? (
              <Link href={`/staff-attendance/salary?month=${shift(month, 1)}`} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted">
                →
              </Link>
            ) : (
              <span className="w-10" />
            )}
          </div>
          {rows.length > 0 && (
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface p-3 text-center">
              <div>
                <p className="text-[11px] text-muted">{t("Earned")}</p>
                <p className="text-sm font-semibold text-foreground">{formatMoney(sum((r) => r.pay.earned + r.bonuses))}</p>
              </div>
              <div className="border-x border-border">
                <p className="text-[11px] text-muted">{t("Given")}</p>
                <p className="text-sm font-semibold text-foreground">{formatMoney(sum((r) => r.advances + r.salaryPaid))}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted">{t("Still to pay")}</p>
                <p className="text-sm font-semibold text-credit">{formatMoney(sum((r) => Math.max(0, r.pay.due)))}</p>
              </div>
            </div>
          )}
          {month === current && <p className="text-xs text-muted">{t("This month is still running — the figures assume the remaining days are worked.")}</p>}
          <SalaryClient month={month} monthLabel={label} shopName={session.shopName} isOwner={session.role === "owner"} rows={rows} />
          {rows.length === 0 && (
            <Link href="/staff-attendance/people" className="btn-primary-sm self-center">
              {t("+ Add people")}
            </Link>
          )}
        </>
      )}
    </div>
  );
}
