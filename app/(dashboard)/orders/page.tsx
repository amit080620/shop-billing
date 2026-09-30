import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { EmptyState } from "@/app/components/EmptyState";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { isModuleEnabled } from "@/lib/modules";
import { formatDateTime, formatMoney } from "@/lib/format";
import { wholesaleReady } from "@/lib/wholesaleData";
import { CancelOrderButton } from "./CancelOrderButton";

const TABS = ["open", "converted", "cancelled"] as const;

/** Orders a salesman booked on the route (New Bill → Save as order), beat by beat — billed in one tap when the goods go out. */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string; beat?: string }> }) {
  const { t } = await getTranslator();
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "quotations")) return <ModuleBlocked moduleKey="quotations" />;
  const admin = createSupabaseAdminClient();
  if (!(await wholesaleReady(admin))) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink fallback="/more" />
        <PageHeader title={t("Orders")} icon={<ClipboardList size={18} strokeWidth={1.8} />} />
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("Orders need a one-time database update (migration 0053).")}</p>
      </div>
    );
  }
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "open";
  const { data: orders } = await admin
    .from("quotations")
    .select("id, quote_number, customer_id, customer_name, items, total, status, staff_id, created_at")
    .eq("shop_id", session.shopId)
    .eq("kind", "order")
    .eq("status", tab)
    .order("created_at", { ascending: false })
    .limit(300);
  const customerIds = [...new Set((orders ?? []).map((o) => o.customer_id).filter((x): x is string => !!x))];
  const staffIds = [...new Set((orders ?? []).map((o) => o.staff_id).filter((x): x is string => !!x))];
  const [{ data: parties }, { data: staff }] = await Promise.all([
    customerIds.length ? admin.from("customers").select("id, beat").in("id", customerIds) : Promise.resolve({ data: [] as { id: string; beat: string | null }[] }),
    staffIds.length ? admin.from("staff").select("id, name").in("id", staffIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const beatOf = new Map((parties ?? []).map((p) => [p.id, p.beat]));
  const staffName = new Map((staff ?? []).map((s) => [s.id, s.name]));
  const rows = (orders ?? []).map((o) => ({ ...o, beat: (o.customer_id && beatOf.get(o.customer_id)) || null }));
  const beats = [...new Set(rows.map((r) => r.beat).filter((b): b is string => !!b))].sort();
  const shown = sp.beat ? rows.filter((r) => r.beat === sp.beat) : rows;
  const total = shown.reduce((s, o) => s + Number(o.total), 0);
  const link = (q: Record<string, string | undefined>) => `/orders?${new URLSearchParams(Object.entries({ tab, beat: sp.beat, ...q }).filter(([, v]) => v) as [string, string][]).toString()}`;

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/more" />
      <PageHeader title={t("Orders")} subtitle={t("Booked by salesmen on the route — make the bill when the goods go out")} icon={<ClipboardList size={18} strokeWidth={1.8} />} />
      <Link href="/bills/new" className="btn-primary text-center">
        {t("+ Book an order")}
      </Link>
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((k) => (
          <Link key={k} href={link({ tab: k })} className={`rounded-full border px-3 py-1 text-xs font-medium ${tab === k ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
            {k === "open" ? t("To bill") : k === "converted" ? t("Billed") : t("Cancelled")}
          </Link>
        ))}
      </div>
      {beats.length > 0 && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto scroll-hide px-4">
          <Link href={link({ beat: undefined })} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${!sp.beat ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
            {t("All beats")}
          </Link>
          {beats.map((b) => (
            <Link key={b} href={link({ beat: b })} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${sp.beat === b ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
              {b}
            </Link>
          ))}
        </div>
      )}
      {shown.length > 0 && (
        <p className="text-xs text-muted">
          {t("{n} order(s) · {amount}", { n: shown.length, amount: formatMoney(total) })}
        </p>
      )}
      {shown.length === 0 ? (
        <EmptyState text={tab === "open" ? t("No order is waiting to be billed.") : t("None here.")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((o) => (
            <li key={o.id} className="neu-card flex flex-col gap-2 px-3.5 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{o.customer_name ?? "—"}</p>
                  <p className="truncate text-xs text-muted">
                    {o.quote_number} · {formatDateTime(o.created_at)}
                    {o.beat ? ` · ${o.beat}` : ""}
                    {o.staff_id && staffName.get(o.staff_id) ? ` · ${t("by {name}", { name: staffName.get(o.staff_id)! })}` : ""}
                  </p>
                  <p className="truncate text-xs text-muted">{o.items.map((i) => `${i.description} × ${i.quantity}`).join(", ")}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-foreground">{formatMoney(Number(o.total))}</p>
              </div>
              {o.status === "open" && (
                <div className="flex gap-2">
                  <Link href={`/bills/new?quote=${o.id}`} className="btn-primary-sm">
                    {t("Make bill →")}
                  </Link>
                  <CancelOrderButton id={o.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
