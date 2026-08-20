import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { Users } from "lucide-react";
import { StaffReportDateControls } from "./StaffReportDateControls";

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default async function StaffPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { from: fromParam, to: toParam } = await searchParams;
  const fromDate = fromParam || isoDaysAgo(30);
  const toDate = toParam || todayIso();
  const startRange = `${fromDate}T00:00:00`;
  const endRange = `${toDate}T23:59:59.999`;

  const [{ data: staffList }, { data: bills }, { data: payments }] = await Promise.all([
    admin.from("staff").select("id, name, role").eq("shop_id", session.shopId),
    admin
      .from("bills")
      .select("staff_id, total")
      .eq("shop_id", session.shopId)
      .eq("status", "active")
      .gte("created_at", startRange)
      .lte("created_at", endRange),
    admin
      .from("payments")
      .select("staff_id, amount")
      .eq("shop_id", session.shopId)
      .gte("created_at", startRange)
      .lte("created_at", endRange),
  ]);

  const staffById = new Map((staffList ?? []).map((s) => [s.id, s]));

  type Row = { staffId: string; billCount: number; salesTotal: number; paymentsCollected: number };
  const byStaff = new Map<string, Row>();

  for (const b of bills ?? []) {
    const row = byStaff.get(b.staff_id) ?? { staffId: b.staff_id, billCount: 0, salesTotal: 0, paymentsCollected: 0 };
    row.billCount += 1;
    row.salesTotal += Number(b.total);
    byStaff.set(b.staff_id, row);
  }
  for (const p of payments ?? []) {
    const row = byStaff.get(p.staff_id) ?? { staffId: p.staff_id, billCount: 0, salesTotal: 0, paymentsCollected: 0 };
    row.paymentsCollected += Number(p.amount);
    byStaff.set(p.staff_id, row);
  }

  const rows = [...byStaff.values()]
    .map((r) => ({ ...r, staff: staffById.get(r.staffId) }))
    .filter((r) => r.staff)
    .sort((a, b) => b.salesTotal - a.salesTotal);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Staff performance" subtitle="Who's selling, who's collecting" icon={<Users size={18} strokeWidth={1.8} />} />

      <StaffReportDateControls from={fromDate} to={toDate} />

      {rows.length === 0 ? (
        <EmptyState text="No billing activity from staff in this period yet." />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.staffId} className="neu-card flex items-center justify-between gap-3 px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{r.staff?.name}</p>
                <p className="text-xs capitalize text-muted">{r.staff?.role}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-foreground">{formatMoney(r.salesTotal)}</p>
                <p className="text-[11px] text-muted">{r.billCount} bill{r.billCount === 1 ? "" : "s"}</p>
                {r.paymentsCollected > 0 && (
                  <p className="text-[11px] text-success">{formatMoney(r.paymentsCollected)} collected</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
