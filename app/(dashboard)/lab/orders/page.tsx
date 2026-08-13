import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { formatDateTime } from "@/lib/format";
import { FlaskConical } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  booked: "Booked",
  sample_collected: "Sample collected",
  received_at_lab: "Received at lab",
  processing: "Processing",
  report_ready: "Report ready",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
const STATUS_TONE: Record<string, string> = {
  booked: "bg-background text-muted",
  sample_collected: "bg-brand-soft text-brand-dark",
  received_at_lab: "bg-brand-soft text-brand-dark",
  processing: "bg-credit-soft text-credit",
  report_ready: "bg-green-100 text-green-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-danger/15 text-danger",
};

export default async function LabOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireSession();
  const { status } = await searchParams;
  const admin = createSupabaseAdminClient();

  let query = admin
    .from("lab_orders")
    .select("id, order_number, patient_name, patient_phone, collection_type, status, created_at")
    .eq("shop_id", session.shopId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (status && status !== "all") query = query.eq("status", status as "booked" | "sample_collected" | "received_at_lab" | "processing" | "report_ready" | "delivered" | "cancelled");
  const { data: orders } = await query;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Lab orders"
        action={
          <Link href="/lab/orders/new" className="btn-primary-sm">
            + Order
          </Link>
        }
        icon={<FlaskConical size={18} strokeWidth={1.8} />}
      />
      <Link href="/lab/tests" className="text-sm text-muted">
        📋 Test catalog & packages
      </Link>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Link href="/lab/orders" className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${!status || status === "all" ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"}`}>
          All
        </Link>
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <Link key={key} href={`/lab/orders?status=${key}`} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${status === key ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"}`}>
            {label}
          </Link>
        ))}
      </div>

      {(!orders || orders.length === 0) ? (
        <EmptyState text="No orders here." />
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/lab/orders/${o.id}`} className="flex items-center justify-between rounded-xl border border-border bg-surface p-3.5 shadow-sm">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{o.patient_name}</p>
                  <p className="text-xs text-muted">
                    #{o.order_number} · {o.collection_type === "home_collection" ? "🏠 Home" : "🚶 Walk-in"} · {formatDateTime(o.created_at)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[o.status]}`}>{STATUS_LABELS[o.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
