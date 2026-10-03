import Link from "@/lib/link";
import { FileText } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { EmptyState } from "@/app/components/EmptyState";
import { formatMoney } from "@/lib/format";
import { formatIsoDate } from "@/lib/dateHelpers";
import { billedSide, lrTotal, transportExtrasReady, type Consignment } from "@/lib/transportData";

import { BillManyLrs } from "./BillManyLrs";

const TABS = ["running", "delivered", "unbilled", "all"] as const;
const STATUS = { booked: "Booked", in_transit: "On the way", delivered: "Delivered", cancelled: "Cancelled" } as const;
const PAY_BY = { paid: "Paid (sender)", to_pay: "To pay (receiver)", tbb: "To be billed" } as const;

export default async function LrListPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { t } = await getTranslator();
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { tab: tabParam } = await searchParams;
  const tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as (typeof TABS)[number]) : "running";

  if (!(await transportExtrasReady(admin))) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink fallback="/transport" />
        <PageHeader title={t("Bilty (LR)")} icon={<FileText size={18} strokeWidth={1.8} />} />
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("Bilty needs a one-time database update (migration 0049).")}</p>
      </div>
    );
  }

  const { data } = await admin.from("consignments").select("*").eq("shop_id", session.shopId).order("lr_date", { ascending: false }).order("created_at", { ascending: false }).limit(400);
  const all = (data ?? []) as Consignment[];
  const inTab = (c: Consignment, k: (typeof TABS)[number]) =>
    k === "running" ? c.status === "booked" || c.status === "in_transit" : k === "delivered" ? c.status === "delivered" : k === "unbilled" ? !c.bill_id && c.status !== "cancelled" && lrTotal(c) > 0 : true;
  const shown = all.filter((c) => inTab(c, tab));
  const unbilledTotal = all.filter((c) => inTab(c, "unbilled")).reduce((s, c) => s + lrTotal(c), 0);

  // Waiting for a bill, by the party that pays.
  const groups = new Map<string, { party: string; lrs: { id: string; lrNumber: string; date: string; route: string; total: number; status: string }[] }>();
  if (tab === "unbilled") {
    for (const c of shown) {
      const side = billedSide(c);
      const party = side === "consignor" ? c.consignor_name : c.consignee_name;
      const key = (side === "consignor" ? c.consignor_customer_id ?? c.consignor_phone : c.consignee_customer_id ?? c.consignee_phone) ?? party.toLowerCase();
      const g = groups.get(key) ?? { party, lrs: [] };
      g.lrs.push({ id: c.id, lrNumber: c.lr_number, date: formatIsoDate(c.lr_date), route: `${c.from_place} → ${c.to_place}`, total: lrTotal(c), status: c.status });
      groups.set(key, g);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/transport" />
      <PageHeader title={t("Bilty (LR)")} subtitle={t("Every consignment with its lorry receipt, from booking to delivery and bill")} icon={<FileText size={18} strokeWidth={1.8} />} />
      <Link href="/transport/lr/new" className="btn-primary text-center">
        {t("+ New bilty (LR)")}
      </Link>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((k) => (
          <Link key={k} href={`/transport/lr?tab=${k}`} className={`rounded-full border px-3 py-1 text-xs font-medium ${tab === k ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
            {k === "running" ? t("On the way") : k === "delivered" ? t("Delivered") : k === "unbilled" ? t("Not billed") : t("All")} · {all.filter((c) => inTab(c, k)).length}
          </Link>
        ))}
      </div>

      {tab === "unbilled" ? (
        shown.length === 0 ? (
          <EmptyState text={t("Every LR's freight is billed.")} />
        ) : (
          <>
            <p className="text-xs text-muted">{t("Freight not billed yet: {amount}", { amount: formatMoney(unbilledTotal) })}</p>
            <BillManyLrs groups={[...groups.values()]} />
          </>
        )
      ) : shown.length === 0 ? (
        <EmptyState text={tab === "running" ? t("Nothing on the road. Book an LR when goods are loaded.") : t("None here.")} />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {shown.map((c) => (
            <li key={c.id}>
              <Link href={`/transport/lr/${c.id}`} className={`neu-card flex items-center justify-between gap-3 px-3.5 py-2.5 ${c.status === "cancelled" ? "opacity-50" : ""}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {c.from_place} → {c.to_place}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {c.lr_number} · {formatIsoDate(c.lr_date)} · {c.consignee_name}
                    {c.vehicle_number ? ` · ${c.vehicle_number}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-foreground">{formatMoney(lrTotal(c))}</p>
                  <p className="text-[11px] text-muted">
                    {t(STATUS[c.status])} · {c.bill_id ? t("Billed") : t(PAY_BY[c.pay_by])}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
