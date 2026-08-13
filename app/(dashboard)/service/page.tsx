import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { Wrench } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  received: "Received",
  in_progress: "In progress",
  ready: "Ready for pickup",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
const STATUS_TONE: Record<string, string> = {
  received: "bg-background text-muted",
  in_progress: "bg-credit-soft text-credit",
  ready: "bg-brand-soft text-brand-dark",
  delivered: "bg-background text-muted",
  cancelled: "bg-danger/15 text-danger",
};

export default async function ServiceJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireSession();
  const { status } = await searchParams;
  const admin = createSupabaseAdminClient();

  const activeFilter = status && status !== "all" ? status : null;

  let query = admin
    .from("service_jobs")
    .select("id, job_number, customer_name, item_description, status, expected_date, created_at")
    .eq("shop_id", session.shopId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (activeFilter) {
    query = query.eq("status", activeFilter as "received" | "in_progress" | "ready" | "delivered" | "cancelled");
  } else {
    query = query.neq("status", "delivered").neq("status", "cancelled");
  }

  const { data: jobs } = await query;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Jobs"
        action={
          <Link href="/service/new" className="btn-primary-sm">
            + New job
          </Link>
        }
        icon={<Wrench size={18} strokeWidth={1.8} />}
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Link href="/service" className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium ${!activeFilter ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"}`}>
          Open jobs
        </Link>
        {(["received", "in_progress", "ready", "delivered", "cancelled"] as const).map((s) => (
          <Link
            key={s}
            href={`/service?status=${s}`}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium ${activeFilter === s ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"}`}
          >
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {(!jobs || jobs.length === 0) ? (
        <EmptyState text="No jobs here — tap + New job when an item comes in for service." />
      ) : (
        <ul className="flex flex-col gap-2">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/service/${j.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface shadow-sm px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{j.item_description}</p>
                  <p className="text-xs text-muted">{j.customer_name} · #{j.job_number}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[j.status]}`}>
                  {STATUS_LABELS[j.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
