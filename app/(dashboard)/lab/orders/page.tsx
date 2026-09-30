import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { formatDateTime } from "@/lib/format";
import { FlaskConical, ClipboardList } from "lucide-react";
import { getTranslator } from "@/lib/i18n/server";
import { BackLink } from "@/app/components/BackLink";
import { redirect } from "next/navigation";
import { orderNumberFromScan } from "@/lib/labSamples";

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
  sample_collected: "bg-brand-soft text-brand-text",
  received_at_lab: "bg-brand-soft text-brand-text",
  processing: "bg-credit-soft text-credit",
  report_ready: "bg-green-100 text-green-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-danger/15 text-danger",
};

export default async function LabOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { t } = await getTranslator();
  const session = await requireSession();
  const { status, q: rawQ } = await searchParams;
  const admin = createSupabaseAdminClient();
  const q = (rawQ ?? "").trim();
  // A scanned sample sticker (or a typed order number) opens its order straight away.
  const scanned = q ? orderNumberFromScan(q) : null;
  if (scanned) {
    const { data: hit } = await admin.from("lab_orders").select("id").eq("shop_id", session.shopId).eq("order_number", scanned).maybeSingle();
    if (hit) redirect(`/lab/orders/${hit.id}`);
  }

  let query = admin
    .from("lab_orders")
    .select("id, order_number, patient_name, patient_phone, collection_type, status, created_at")
    .eq("shop_id", session.shopId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (q && !scanned) {
    const safe = q.replace(/[%,()]/g, " ").slice(0, 60);
    query = query.or(`patient_name.ilike.%${safe}%,patient_phone.ilike.%${safe}%,order_number.ilike.%${safe}%`);
  }
  if (status && status !== "all") query = query.eq("status", status as "booked" | "sample_collected" | "received_at_lab" | "processing" | "report_ready" | "delivered" | "cancelled");
  const { data: orders } = await query;

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/lab" />
      <PageHeader
        title={t("Lab orders")}
        action={
          <Link href="/lab/orders/new" className="btn-primary-sm">
            + Order
          </Link>
        }
        icon={<FlaskConical size={18} strokeWidth={1.8} />}
      />
      <Link href="/lab/tests" className="flex items-center gap-1 text-sm text-muted">
        <ClipboardList size={14} /> {t("Test catalog & packages")}
      </Link>

      <form action="/lab/orders" className="flex gap-2">
        <input name="q" defaultValue={q} autoFocus={false} placeholder={t("Scan a sample sticker, or search name / phone / order no.")} className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" enterKeyHint="search" />
        <button className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground">{t("Find")}</button>
      </form>

      <div className="flex gap-2 overflow-x-auto scroll-hide pb-1">
        <Link
          href="/lab/orders"
          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${!status || status === "all" ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}
          style={!status || status === "all" ? { boxShadow: "var(--elev-xs)" } : undefined}
        >
          All
        </Link>
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <Link
            key={key}
            href={`/lab/orders?status=${key}`}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${status === key ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}
            style={status === key ? { boxShadow: "var(--elev-xs)" } : undefined}
          >
            {label}
          </Link>
        ))}
      </div>

      {(!orders || orders.length === 0) ? (
        <EmptyState text={t("No orders here.")} />
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/lab/orders/${o.id}`} className="flex items-center justify-between rounded-xl border border-border bg-surface p-3.5 shadow-sm">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{o.patient_name}</p>
                  <p className="text-xs text-muted">
                    #{o.order_number} · {o.collection_type === "home_collection" ? "Home" : "Walk-in"} · {formatDateTime(o.created_at)}
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
