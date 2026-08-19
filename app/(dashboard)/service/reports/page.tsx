import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { Wrench } from "lucide-react";
import { ServiceReportControls } from "./ServiceReportControls";

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

const STATUS_LABELS: Record<string, string> = {
  received: "Received",
  in_progress: "In progress",
  ready: "Ready",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default async function ServiceReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { from: fromParam, to: toParam } = await searchParams;
  const fromDate = fromParam || isoDaysAgo(30);
  const toDate = toParam || todayIso();

  const { data: jobs } = await admin
    .from("service_jobs")
    .select("id, job_number, item_description, status, technician_name, final_cost, advance_paid, created_at, device_category")
    .eq("shop_id", session.shopId)
    .gte("created_at", `${fromDate}T00:00:00`)
    .lte("created_at", `${toDate}T23:59:59.999`)
    .order("created_at", { ascending: false });

  const all = jobs ?? [];
  const delivered = all.filter((j) => j.status === "delivered");

  // Only delivered jobs have a settled final cost — counting in-progress
  // ones would inflate revenue with amounts that may still change.
  const revenue = delivered.reduce((s, j) => s + Number(j.final_cost ?? 0), 0);

  const byStatus = new Map<string, number>();
  for (const j of all) byStatus.set(j.status, (byStatus.get(j.status) ?? 0) + 1);

  const byTechnician = new Map<string, { jobs: number; revenue: number }>();
  for (const j of delivered) {
    const key = j.technician_name?.trim() || "Unassigned";
    const row = byTechnician.get(key) ?? { jobs: 0, revenue: 0 };
    row.jobs += 1;
    row.revenue += Number(j.final_cost ?? 0);
    byTechnician.set(key, row);
  }
  const technicians = [...byTechnician.entries()].sort((a, b) => b[1].revenue - a[1].revenue);

  const byCategory = new Map<string, number>();
  for (const j of all) {
    const key = j.device_category?.trim() || "Other";
    byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
  }
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Job report"
        subtitle="Repairs taken in, completed and earned over a period"
        icon={<Wrench size={18} strokeWidth={1.8} />}
      />

      <ServiceReportControls from={fromDate} to={toDate} />

      <section className="grid grid-cols-2 gap-3">
        <div className="neu-card p-4">
          <p className="text-xs text-muted">Jobs taken in</p>
          <p className="mt-1 text-2xl font-bold text-foreground neu-text">{all.length}</p>
        </div>
        <div className="neu-card p-4">
          <p className="text-xs text-muted">Delivered</p>
          <p className="mt-1 text-2xl font-bold text-foreground neu-text">{delivered.length}</p>
        </div>
        <div className="neu-card col-span-2 p-4">
          <p className="text-xs text-muted">Earned from delivered jobs</p>
          <p className="mt-1 text-3xl font-bold text-foreground neu-text">{formatMoney(revenue)}</p>
        </div>
      </section>

      {all.length === 0 ? (
        <EmptyState text="No jobs in this period." />
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">By status</h2>
            <div className="neu-card flex flex-col gap-1.5 p-4">
              {[...byStatus.entries()].map(([status, count]) => (
                <div key={status} className="flex items-center justify-between text-sm">
                  <span className="text-muted">{STATUS_LABELS[status] ?? status}</span>
                  <span className="font-medium text-foreground">{count}</span>
                </div>
              ))}
            </div>
          </section>

          {technicians.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">By technician</h2>
              <ul className="flex flex-col gap-2">
                {technicians.map(([name, row]) => (
                  <li key={name} className="neu-card flex items-center justify-between gap-3 px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{name}</p>
                      <p className="text-xs text-muted">{row.jobs} job{row.jobs === 1 ? "" : "s"} delivered</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-foreground">{formatMoney(row.revenue)}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {categories.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">By item type</h2>
              <div className="neu-card flex flex-col gap-1.5 p-4">
                {categories.map(([cat, count]) => (
                  <div key={cat} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-muted">{cat}</span>
                    <span className="font-medium text-foreground">{count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
