import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";

export default async function DoctorsReportPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: bills } = await admin
    .from("bills")
    .select("doctor_name, patient_name, total, created_at")
    .eq("shop_id", session.shopId)
    .eq("status", "active")
    .not("doctor_name", "is", null)
    .order("created_at", { ascending: false });

  const byDoctor = new Map<string, { count: number; total: number; lastDate: string }>();
  for (const b of bills ?? []) {
    if (!b.doctor_name) continue;
    const existing = byDoctor.get(b.doctor_name) ?? { count: 0, total: 0, lastDate: b.created_at };
    existing.count += 1;
    existing.total += Number(b.total);
    if (b.created_at > existing.lastDate) existing.lastDate = b.created_at;
    byDoctor.set(b.doctor_name, existing);
  }
  const doctors = [...byDoctor.entries()].sort((a, b) => b[1].count - a[1].count);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Doctor-wise sales"
        subtitle="Built from prescriptions captured at billing time."
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M9 12h6M12 9v6" />
          </svg>
        }
      />

      {doctors.length === 0 ? (
        <EmptyState text="No prescription-linked sales recorded yet — these show up once a bill captures a doctor's name for an Rx item." />
      ) : (
        <ul className="flex flex-col gap-2">
          {doctors.map(([name, stats]) => (
            <li key={name} className="rounded-xl border border-border bg-surface shadow-sm px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Dr. {name}</p>
                <p className="text-sm font-semibold text-foreground">{formatMoney(stats.total)}</p>
              </div>
              <p className="text-xs text-muted">
                {stats.count} bill{stats.count === 1 ? "" : "s"} · last on{" "}
                {new Date(stats.lastDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
