import { Gift } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { EmptyState } from "@/app/components/EmptyState";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { isModuleEnabled } from "@/lib/modules";
import { formatMoney } from "@/lib/format";
import { todayIso } from "@/lib/dateHelpers";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Scheme goods: free units the company gave on purchases ("10 + 5"), free units given to parties on
 * bills ("10 + 2"), and what the shop kept — sold at full rate, the scheme's own profit. */
export default async function SchemesPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { t } = await getTranslator();
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "advanced_reports")) return <ModuleBlocked moduleKey="advanced_reports" />;
  const admin = createSupabaseAdminClient();
  const sp = await searchParams;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : todayIso();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : `${to.slice(0, 7)}-01`;

  const [{ data: bought }, { data: bills }] = await Promise.all([
    admin.from("purchase_items").select("product_id, quantity, free_quantity, unit_price, purchases!inner(shop_id, purchase_date)").eq("purchases.shop_id", session.shopId).gte("purchases.purchase_date", from).lte("purchases.purchase_date", to).gt("free_quantity", 0).limit(20000),
    admin.from("bills").select("id").eq("shop_id", session.shopId).eq("status", "active").gte("created_at", `${from}T00:00:00+05:30`).lte("created_at", `${to}T23:59:59.999+05:30`).limit(20000),
  ]);
  const billIds = (bills ?? []).map((b) => b.id);
  const given: { product_id: string | null; quantity: number }[] = [];
  for (let i = 0; i < billIds.length; i += 200) {
    const { data } = await admin.from("bill_items").select("product_id, quantity").in("bill_id", billIds.slice(i, i + 200)).eq("unit_price", 0).like("product_name", "%(free — buy%");
    given.push(...(data ?? []));
  }
  type Row = { received: number; paidQty: number; paidValue: number; given: number };
  const rows = new Map<string, Row>();
  const row = (id: string) => rows.get(id) ?? { received: 0, paidQty: 0, paidValue: 0, given: 0 };
  for (const b of bought ?? []) {
    if (!b.product_id) continue;
    const r = row(b.product_id);
    rows.set(b.product_id, { ...r, received: r.received + Number(b.free_quantity), paidQty: r.paidQty + Number(b.quantity), paidValue: r.paidValue + Number(b.quantity) * Number(b.unit_price) });
  }
  for (const g of given) {
    if (!g.product_id) continue;
    const r = row(g.product_id);
    rows.set(g.product_id, { ...r, given: r.given + Number(g.quantity) });
  }
  const ids = [...rows.keys()];
  const { data: products } = ids.length ? await admin.from("products").select("id, name, price, unit").in("id", ids) : { data: [] };
  const list = (products ?? [])
    .map((p) => {
      const r = rows.get(p.id)!;
      const kept = r2(r.received - r.given);
      const buyRate = r.paidQty > 0 ? r2(r.paidValue / r.paidQty) : null;
      const realCost = r.paidQty > 0 ? r2(r.paidValue / (r.paidQty + r.received)) : null;
      return { id: p.id, name: p.name, unit: p.unit, rate: Number(p.price), ...r, kept, buyRate, realCost, keptValue: r2(Math.max(0, kept) * Number(p.price)) };
    })
    .sort((a, b) => b.keptValue - a.keptValue);
  const totalKept = r2(list.reduce((s, r) => s + r.keptValue, 0));

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/reports" />
      <PageHeader title={t("Scheme report")} subtitle={t("Free goods from the company, free goods to parties, and what you kept")} icon={<Gift size={18} strokeWidth={1.8} />} />
      <form className="grid grid-cols-[1fr_1fr_auto] items-end gap-2" action="/reports/schemes">
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          {t("From")}
          <input type="date" name="from" defaultValue={from} className="rounded-lg border border-border bg-surface px-2 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          {t("To")}
          <input type="date" name="to" defaultValue={to} className="rounded-lg border border-border bg-surface px-2 py-2 text-sm" />
        </label>
        <button className="rounded-lg border border-border px-3 py-2 text-sm font-medium">{t("Show")}</button>
      </form>
      <div className="neu-card p-3.5">
        <p className="text-xs text-muted">{t("Scheme goods you kept, at today's rate")}</p>
        <p className="text-xl font-semibold text-success">{formatMoney(totalKept)}</p>
        <p className="mt-1 text-[11px] text-muted">{t("Company gave 10 + 5, you gave 10 + 2: the 3 you kept sell at full rate with no cost — that's this.")}</p>
      </div>
      {list.length === 0 ? (
        <EmptyState text={t("No scheme goods in these dates. Enter the free quantity on a purchase, and put items on Buy X get Y in Offers.")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((r) => (
            <li key={r.id} className="neu-card flex flex-col gap-1 px-3.5 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-semibold text-foreground">{r.name}</p>
                <p className={`shrink-0 text-sm font-semibold ${r.kept >= 0 ? "text-success" : "text-danger"}`}>{formatMoney(r.keptValue)}</p>
              </div>
              <p className="text-xs text-muted">
                {t("Free in {in} · free out {out} · kept {kept}", { in: r.received, out: r.given, kept: r.kept })}
                {r.buyRate != null && r.realCost != null ? ` · ${t("buy rate {rate}, real cost {cost}", { rate: formatMoney(r.buyRate), cost: formatMoney(r.realCost) })}` : ""}
              </p>
              {r.kept < 0 && <p className="text-[11px] text-danger">{t("You gave away more free than the company gave you.")}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
