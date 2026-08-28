import Link from "next/link";
import { listTreatmentPlansAction } from "@/lib/actions/treatmentPlans";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { ClipboardList } from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  active: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
};

export default async function TreatmentPlansPage() {
  const plans = await listTreatmentPlansAction();

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Treatment plans"
        action={
          <Link href="/clinic/treatment-plans/new" className="btn-primary-sm">
            + New plan
          </Link>
        }
        icon={<ClipboardList size={18} strokeWidth={1.8} />}
      />
      <Link href="/clinic" className="text-sm text-muted">
        ← Clinic
      </Link>

      {plans.length === 0 ? (
        <EmptyState text="No treatment plans yet — create one to give a patient a quotation before starting work." />
      ) : (
        <ul className="flex flex-col gap-2">
          {plans.map((p) => (
            <li key={p.id}>
              <Link
                href={`/clinic/treatment-plans/${p.id}`}
                className="neu-card flex items-center justify-between gap-3 p-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{p.patientName}</p>
                  <p className="text-xs text-muted">
                    {p.itemCount} treatment{p.itemCount === 1 ? "" : "s"} · ₹{p.totalEstimate.toLocaleString("en-IN")}
                    {p.doctorName ? ` · Dr. ${p.doctorName}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[p.status] ?? STATUS_STYLE.draft}`}>
                  {p.billId ? "Billed" : p.status === "active" ? "In progress" : p.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
