import Link from "next/link";
import { Refrigerator } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { EmptyState } from "@/app/components/EmptyState";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { isModuleEnabled } from "@/lib/modules";
import { formatDateTime, formatMoney } from "@/lib/format";
import { ingredientCosts, recipesReady } from "@/lib/recipeData";
import { smallUnit } from "@/lib/recipes";
import { DeleteLossButton, KitchenLossForm } from "./KitchenLossForm";

const DAYS = 7;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The kitchen's raw materials: what's left, how fast it goes (by the recipes of what sold), how
 * many days that lasts — and what was thrown away or eaten by staff. */
export default async function KitchenPage() {
  const { t } = await getTranslator();
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "recipe_stock")) return <ModuleBlocked moduleKey="recipe_stock" />;
  const admin = createSupabaseAdminClient();
  if (!(await recipesReady(admin))) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink fallback="/restaurant" />
        <PageHeader title={t("Kitchen stock")} icon={<Refrigerator size={18} strokeWidth={1.8} />} />
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("Recipes need a one-time database update (migration 0050).")}</p>
      </div>
    );
  }

  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
  const [{ data: raws }, { data: usage }] = await Promise.all([
    admin.from("products").select("id, name, unit, stock_quantity, low_stock_threshold").eq("shop_id", session.shopId).eq("is_raw_material", true).order("name"),
    admin.from("kitchen_usage").select("id, ingredient_id, kind, quantity, note, created_at").eq("shop_id", session.shopId).gte("created_at", since).order("created_at", { ascending: false }),
  ]);
  const costs = await ingredientCosts(admin, session.shopId, (raws ?? []).map((r) => r.id));
  const name = new Map((raws ?? []).map((r) => [r.id, r]));
  const used = new Map<string, { sale: number; loss: number }>();
  for (const u of usage ?? []) {
    const e = used.get(u.ingredient_id) ?? { sale: 0, loss: 0 };
    if (u.kind === "sale") e.sale += Number(u.quantity);
    else e.loss += Number(u.quantity);
    used.set(u.ingredient_id, e);
  }
  const show = (id: string, qty: number) => {
    const unit = name.get(id)?.unit ?? "";
    const small = smallUnit(unit);
    // Under one kilo or litre reads better in grams or millilitres.
    return small && Math.abs(qty) < 1 ? `${round2(qty * small.factor)} ${small.label}` : `${round2(qty).toLocaleString("en-IN")} ${unit.toLowerCase()}`;
  };
  const rows = (raws ?? []).map((r) => {
    const u = used.get(r.id) ?? { sale: 0, loss: 0 };
    const perDay = (u.sale + u.loss) / DAYS;
    const stock = Number(r.stock_quantity);
    return { ...r, stock, sale: u.sale, loss: u.loss, daysLeft: perDay > 0 ? Math.floor(stock / perDay) : null, low: stock <= Number(r.low_stock_threshold) };
  });
  rows.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
  const losses = (usage ?? []).filter((u) => u.kind !== "sale");
  const lossValue = losses.reduce((s, u) => s + Number(u.quantity) * (costs.get(u.ingredient_id) ?? 0), 0);
  const stockValue = rows.reduce((s, r) => s + Math.max(0, r.stock) * (costs.get(r.id) ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/restaurant/recipes" />
      <PageHeader title={t("Kitchen stock")} subtitle={t("Raw materials left, how fast they go, and what was wasted")} icon={<Refrigerator size={18} strokeWidth={1.8} />} />

      <div className="grid grid-cols-2 gap-2">
        <div className="neu-card p-3.5 text-center">
          <p className="text-xs text-muted">{t("Raw materials in stock")}</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{formatMoney(stockValue)}</p>
        </div>
        <div className="neu-card p-3.5 text-center">
          <p className="text-xs text-muted">{t("Wasted and staff meals, {n} days", { n: DAYS })}</p>
          <p className={`mt-1 text-lg font-semibold ${lossValue > 0 ? "text-danger" : "text-foreground"}`}>{formatMoney(lossValue)}</p>
        </div>
      </div>

      <KitchenLossForm raws={(raws ?? []).map((r) => ({ id: r.id, name: r.name, unit: r.unit }))} />

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{t("Raw materials")}</p>
        <Link href="/purchases/new" className="text-xs font-medium text-brand-text">
          {t("+ Record a purchase")}
        </Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState text={t("No raw materials yet. Open a dish in Recipes and add what goes into it.")} />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.id} className={`neu-card flex items-center justify-between gap-3 px-3.5 py-2.5 ${r.low ? "border border-credit" : ""}`}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                <p className="truncate text-xs text-muted">
                  {t("Used {used} in {n} days", { used: show(r.id, r.sale), n: DAYS })}
                  {r.loss > 0 ? ` · ${t("lost {lost}", { lost: show(r.id, r.loss) })}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-sm font-semibold ${r.low ? "text-credit" : "text-foreground"}`}>{show(r.id, r.stock)}</p>
                <p className="text-[11px] text-muted">{r.daysLeft != null ? t("~{n} days left", { n: r.daysLeft }) : r.low ? t("Low") : "—"}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {losses.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-foreground">{t("Wastage and staff meals")}</p>
          <ul className="flex flex-col gap-1">
            {losses.map((u) => (
              <li key={u.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {name.get(u.ingredient_id)?.name ?? "—"} · {show(u.ingredient_id, Number(u.quantity))} · {u.kind === "wastage" ? t("Wastage") : t("Staff meal")}
                  {u.note ? ` · ${u.note}` : ""}
                  <span className="block text-muted">{formatDateTime(u.created_at)}</span>
                </span>
                <span className="shrink-0 font-medium text-foreground">{formatMoney(Number(u.quantity) * (costs.get(u.ingredient_id) ?? 0))}</span>
                <DeleteLossButton id={u.id} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
