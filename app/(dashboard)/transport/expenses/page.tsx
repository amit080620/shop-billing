import Link from "@/lib/link";
import { Fuel } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { EmptyState } from "@/app/components/EmptyState";
import { formatMoney, paymentMethodLabel } from "@/lib/format";
import { formatIsoDate, todayIso } from "@/lib/dateHelpers";
import { transportExtrasReady } from "@/lib/transportData";
import { EXPENSE_CATEGORIES, EXPENSE_LABEL, type ExpenseCategory } from "@/lib/transport";
import { TripExpenseForm } from "../TripExpenseForm";
import { DeleteExpenseButton } from "./DeleteExpenseButton";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";

const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** Everything spent on the vehicles in a month — diesel, toll, bhatta, repairs — entered here. */
export default async function TripExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string; vehicle?: string }> }) {
  const { t } = await getTranslator();
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "vehicle_profit")) return <ModuleBlocked moduleKey="vehicle_profit" />;
  const admin = createSupabaseAdminClient();
  const { month: monthParam, vehicle } = await searchParams;
  const today = todayIso();
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : today.slice(0, 7);

  if (!(await transportExtrasReady(admin))) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink fallback="/transport" />
        <PageHeader title={t("Vehicle expenses")} icon={<Fuel size={18} strokeWidth={1.8} />} />
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("Vehicle expenses need a one-time database update (migration 0049).")}</p>
      </div>
    );
  }

  const next = shiftMonth(month, 1);
  let q = admin
    .from("trip_expenses")
    .select("id, vehicle_id, consignment_id, expense_date, category, amount, payment_method, litres, odometer_km, note")
    .eq("shop_id", session.shopId)
    .gte("expense_date", `${month}-01`)
    .lt("expense_date", `${next}-01`)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (vehicle && /^[0-9a-f-]{36}$/i.test(vehicle)) q = q.eq("vehicle_id", vehicle);
  const [{ data: rows }, { data: vehicles }] = await Promise.all([q, admin.from("vehicles").select("id, name, is_active").eq("shop_id", session.shopId).order("name")]);
  const vehicleName = new Map((vehicles ?? []).map((v) => [v.id, v.name]));
  const byCategory = new Map<ExpenseCategory, number>();
  for (const r of rows ?? []) byCategory.set(r.category as ExpenseCategory, (byCategory.get(r.category as ExpenseCategory) ?? 0) + Number(r.amount));
  const total = (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const monthLabel = new Date(`${month}-01T12:00:00+05:30`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const link = (m: string, v?: string) => `/transport/expenses?month=${m}${v ? `&vehicle=${v}` : ""}`;

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/transport" />
      <PageHeader title={t("Vehicle expenses")} subtitle={t("Diesel, toll, driver bhatta, repairs — vehicle by vehicle")} icon={<Fuel size={18} strokeWidth={1.8} />} />

      <TripExpenseForm vehicles={(vehicles ?? []).filter((v) => v.is_active).map((v) => ({ id: v.id, name: v.name }))} today={today} defaultVehicleId={vehicle ?? null} />

      <div className="flex items-center justify-between gap-2">
        <Link href={link(shiftMonth(month, -1), vehicle)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted">
          ←
        </Link>
        <p className="text-sm font-semibold text-foreground">{monthLabel}</p>
        <Link href={link(next, vehicle)} className={`rounded-lg border border-border px-3 py-1.5 text-xs text-muted ${next > today.slice(0, 7) ? "pointer-events-none opacity-30" : ""}`}>
          →
        </Link>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Link href={link(month)} className={`rounded-full border px-3 py-1 text-xs font-medium ${!vehicle ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
          {t("All vehicles")}
        </Link>
        {(vehicles ?? []).map((v) => (
          <Link key={v.id} href={link(month, v.id)} className={`rounded-full border px-3 py-1 text-xs font-medium ${vehicle === v.id ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
            {v.name}
          </Link>
        ))}
      </div>

      <div className="neu-card flex flex-col gap-1.5 p-3.5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">{t("Spent this month")}</p>
          <p className="text-lg font-bold text-foreground">{formatMoney(total)}</p>
        </div>
        {EXPENSE_CATEGORIES.filter((c) => byCategory.get(c)).map((c) => (
          <div key={c} className="flex items-center justify-between text-xs">
            <span className="text-muted">{t(EXPENSE_LABEL[c])}</span>
            <span className="font-medium text-foreground">{formatMoney(byCategory.get(c) ?? 0)}</span>
          </div>
        ))}
      </div>

      {(rows ?? []).length === 0 ? (
        <EmptyState text={t("No vehicle expenses this month.")} />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {(rows ?? []).map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  {t(EXPENSE_LABEL[r.category as ExpenseCategory])}
                  {r.litres ? ` · ${Number(r.litres)} L` : ""}
                  {r.odometer_km ? ` · ${Number(r.odometer_km).toLocaleString("en-IN")} km` : ""}
                </p>
                <p className="truncate text-xs text-muted">
                  {formatIsoDate(r.expense_date)} · {r.vehicle_id ? (vehicleName.get(r.vehicle_id) ?? "—") : t("No vehicle")} · {t(paymentMethodLabel(r.payment_method))}
                  {r.note ? ` · ${r.note}` : ""}
                </p>
                {r.consignment_id && (
                  <Link href={`/transport/lr/${r.consignment_id}`} className="text-[11px] text-brand-text">
                    {t("On an LR →")}
                  </Link>
                )}
              </div>
              <p className="shrink-0 text-sm font-semibold text-foreground">{formatMoney(Number(r.amount))}</p>
              <DeleteExpenseButton id={r.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
