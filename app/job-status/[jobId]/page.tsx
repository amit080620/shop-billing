import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatDateTime } from "@/lib/format";
import { Inbox, Wrench, PackageCheck, CheckCircle2, XCircle } from "lucide-react";

// Looked up by the job's own UUID — unguessable, no login, read-only.
// Same trust model already used by the order-status and khata links.
export default async function JobTrackPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const admin = createSupabaseAdminClient();

  const { data: job } = await admin
    .from("service_jobs")
    .select(
      "id, job_number, customer_name, item_description, status, technician_name, estimated_cost, final_cost, advance_paid, expected_date, created_at, ready_at, delivered_at, shop_id",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (!job) notFound();

  const { data: shop } = await admin
    .from("shops")
    .select("name, logo_url")
    .eq("id", job.shop_id)
    .single();

  // The visible progress track. "cancelled" is deliberately not a step
  // on this line — it's an exit from the flow, shown separately below,
  // rather than something a job "progresses" to.
  const STEPS = [
    { key: "received", label: "Received", icon: Inbox, note: "We have your item" },
    { key: "in_progress", label: "In progress", icon: Wrench, note: "Being worked on now" },
    { key: "ready", label: "Ready", icon: PackageCheck, note: "Ready for pickup!" },
    { key: "delivered", label: "Delivered", icon: CheckCircle2, note: "Handed back to you" },
  ] as const;

  const currentIndex = STEPS.findIndex((s) => s.key === job.status);
  const isCancelled = job.status === "cancelled";

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-6">
      <div className="flex flex-col items-center gap-2 text-center">
        {shop?.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element -- small shop logo
          <img src={shop.logo_url} alt="" className="h-14 w-14 rounded-full object-contain" />
        )}
        <h1 className="text-lg font-bold text-foreground">{shop?.name}</h1>
        <p className="text-sm text-foreground">{job.item_description}</p>
        <p className="text-xs text-muted">Job #{job.job_number} · {job.customer_name}</p>
      </div>

      {isCancelled ? (
        <div className="neu-card flex flex-col items-center gap-2 p-6 text-center">
          <XCircle size={30} className="text-danger" />
          <p className="text-base font-semibold text-foreground">This job was cancelled</p>
          <p className="text-xs text-muted">Please contact the shop if you need any help.</p>
        </div>
      ) : (
        <div className="neu-card flex flex-col gap-3 p-4">
          {STEPS.map((step, i) => {
            const done = i <= currentIndex;
            const isCurrent = i === currentIndex;
            const Icon = step.icon;
            return (
              <div key={step.key} className="flex items-center gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    done ? "bg-brand-soft text-brand-text" : "bg-background text-muted"
                  }`}
                  style={
                    done
                      ? { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }
                      : undefined
                  }
                >
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${isCurrent ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted"}`}>
                    {step.label}
                  </p>
                  {isCurrent && <p className="text-xs text-brand-text">{step.note}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="neu-card flex flex-col gap-2 p-4 text-sm">
        {job.technician_name && (
          <div className="flex items-center justify-between">
            <span className="text-muted">Technician</span>
            <span className="text-foreground">{job.technician_name}</span>
          </div>
        )}
        {job.expected_date && job.status !== "delivered" && (
          <div className="flex items-center justify-between">
            <span className="text-muted">Expected by</span>
            <span className="text-foreground">{job.expected_date}</span>
          </div>
        )}
        {job.estimated_cost != null && job.final_cost == null && (
          <div className="flex items-center justify-between">
            <span className="text-muted">Estimated cost</span>
            <span className="text-foreground">{formatMoney(Number(job.estimated_cost))}</span>
          </div>
        )}
        {job.final_cost != null && (
          <div className="flex items-center justify-between">
            <span className="text-muted">Final cost</span>
            <span className="font-semibold text-foreground">{formatMoney(Number(job.final_cost))}</span>
          </div>
        )}
        {Number(job.advance_paid) > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-muted">Advance paid</span>
            <span className="text-success">{formatMoney(Number(job.advance_paid))}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="text-muted">Dropped off</span>
          <span className="text-xs text-foreground">{formatDateTime(job.created_at)}</span>
        </div>
      </div>

      <p className="text-center text-xs text-muted">
        Refresh this page any time for the latest status — no need to call.
      </p>
    </div>
  );
}
