import Link from "next/link";
import { Truck } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { EmptyState } from "@/app/components/EmptyState";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { isModuleEnabled } from "@/lib/modules";
import { formatIsoDate } from "@/lib/dateHelpers";
import { gapsReady } from "@/lib/gapsData";
import { BillManyChallans } from "./BillManyChallans";

const TABS = ["open", "billed", "all"] as const;

export default async function ChallansPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { t } = await getTranslator();
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "delivery_challan")) return <ModuleBlocked moduleKey="delivery_challan" />;
  const admin = createSupabaseAdminClient();
  if (!(await gapsReady(admin))) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink fallback="/more" />
        <PageHeader title={t("Delivery challans")} icon={<Truck size={18} strokeWidth={1.8} />} />
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("This needs a one-time database update (migration 0052).")}</p>
      </div>
    );
  }
  const { tab: tabParam } = await searchParams;
  const tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as (typeof TABS)[number]) : "open";
  const { data } = await admin
    .from("delivery_challans")
    .select("id, challan_number, challan_date, customer_id, customer_name, site, items, status, bill_id")
    .eq("shop_id", session.shopId)
    .order("challan_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);
  const all = data ?? [];
  const shown = tab === "all" ? all : all.filter((c) => c.status === tab);
  const count = (k: (typeof TABS)[number]) => (k === "all" ? all.length : all.filter((c) => c.status === k).length);
  const summary = (items: { quantity: number; unit: string; name: string }[]) =>
    items.length === 1 ? `${items[0].name} × ${items[0].quantity}` : t("{n} items", { n: items.length });

  // Open challans, party by party, to bill several together.
  const groups = new Map<string, { party: string; customerId: string | null; challans: { id: string; number: string; date: string; summary: string }[] }>();
  if (tab === "open") {
    for (const c of shown) {
      const key = c.customer_id ?? `name:${c.customer_name.toLowerCase()}`;
      const g = groups.get(key) ?? { party: c.customer_name, customerId: c.customer_id, challans: [] };
      g.challans.push({ id: c.id, number: c.challan_number, date: formatIsoDate(c.challan_date), summary: `${summary(c.items)}${c.site ? ` · ${c.site}` : ""}` });
      groups.set(key, g);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/more" />
      <PageHeader title={t("Delivery challans")} subtitle={t("Goods sent before the bill — bill one challan, or a month's challans together")} icon={<Truck size={18} strokeWidth={1.8} />} />
      <Link href="/challans/new" className="btn-primary text-center">
        {t("+ New challan")}
      </Link>
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((k) => (
          <Link key={k} href={`/challans?tab=${k}`} className={`rounded-full border px-3 py-1 text-xs font-medium ${tab === k ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
            {k === "open" ? t("Not billed") : k === "billed" ? t("Billed") : t("All")} · {count(k)}
          </Link>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyState text={tab === "open" ? t("No challan is waiting for a bill.") : t("None here.")} />
      ) : tab === "open" ? (
        <BillManyChallans groups={[...groups.values()]} />
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((c) => (
            <li key={c.id}>
              <Link href={`/challans/${c.id}`} className={`neu-card flex items-center justify-between gap-3 px-3.5 py-2.5 ${c.status === "cancelled" ? "opacity-50" : ""}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{c.customer_name}</p>
                  <p className="truncate text-xs text-muted">
                    {c.challan_number} · {formatIsoDate(c.challan_date)} · {summary(c.items)}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted">{c.status === "billed" ? t("Billed") : c.status === "cancelled" ? t("Cancelled") : t("Not billed")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
