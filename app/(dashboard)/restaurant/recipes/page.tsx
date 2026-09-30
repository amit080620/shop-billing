import Link from "next/link";
import { ChefHat } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { EmptyState } from "@/app/components/EmptyState";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { isModuleEnabled } from "@/lib/modules";
import { formatMoney } from "@/lib/format";
import { ingredientCosts, loadRecipeMap, recipesReady } from "@/lib/recipeData";
import { foodCostPercent, plateCost } from "@/lib/recipes";

const TABS = ["all", "none", "high"] as const;
/** Above this share of the price, a plate is flagged — most kitchens aim for 25–35%. */
const HIGH_FOOD_COST = 35;

/** Every dish on the menu: its recipe, what a plate costs in raw materials, and its food cost %. */
export default async function RecipesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { t } = await getTranslator();
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "recipe_stock")) return <ModuleBlocked moduleKey="recipe_stock" />;
  const admin = createSupabaseAdminClient();
  const { tab: tabParam } = await searchParams;
  const tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as (typeof TABS)[number]) : "all";

  if (!(await recipesReady(admin))) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink fallback="/restaurant" />
        <PageHeader title={t("Recipes & food cost")} icon={<ChefHat size={18} strokeWidth={1.8} />} />
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("Recipes need a one-time database update (migration 0050).")}</p>
      </div>
    );
  }

  const [{ data: dishes }, recipes] = await Promise.all([
    admin.from("products").select("id, name, price, offer_price, gst_percent, categories ( name )").eq("shop_id", session.shopId).eq("is_raw_material", false).order("name"),
    loadRecipeMap(admin, session.shopId),
  ]);
  const ingredientIds = [...new Set([...recipes.values()].flat().map((r) => r.ingredientId))];
  const costs = await ingredientCosts(admin, session.shopId, ingredientIds);

  // The price a plate sells for before GST — the figure food cost is measured against.
  const beforeGst = (price: number, gst: number) => (session.priceIncludesGst ? price / (1 + gst / 100) : price);
  const rows = (dishes ?? []).map((d) => {
    const recipe = recipes.get(d.id) ?? [];
    const sell = beforeGst(Number(d.offer_price && Number(d.offer_price) > 0 ? d.offer_price : d.price), Number(d.gst_percent));
    const { cost, missing } = plateCost(recipe, costs);
    const pct = recipe.length ? foodCostPercent(cost, sell) : null;
    const category = (Array.isArray(d.categories) ? d.categories[0] : d.categories) as { name: string } | null;
    return { id: d.id, name: d.name, category: category?.name ?? null, lines: recipe.length, cost, missing: missing.length, sell, pct };
  });
  const withRecipe = rows.filter((r) => r.lines > 0).length;
  const shown = rows.filter((r) => (tab === "none" ? r.lines === 0 : tab === "high" ? (r.pct ?? 0) > HIGH_FOOD_COST : true));
  const avg = (() => {
    const known = rows.filter((r) => r.pct != null && r.sell > 0);
    const sell = known.reduce((s, r) => s + r.sell, 0);
    return sell > 0 ? foodCostPercent(known.reduce((s, r) => s + r.cost, 0), sell) : null;
  })();

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/restaurant" />
      <PageHeader title={t("Recipes & food cost")} subtitle={t("What each plate takes — raw materials come off stock as it sells")} icon={<ChefHat size={18} strokeWidth={1.8} />} />

      <div className="grid grid-cols-2 gap-2">
        <div className="neu-card p-3.5 text-center">
          <p className="text-xs text-muted">{t("Dishes with a recipe")}</p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {withRecipe} / {rows.length}
          </p>
        </div>
        <div className="neu-card p-3.5 text-center">
          <p className="text-xs text-muted">{t("Average food cost")}</p>
          <p className={`mt-1 text-lg font-semibold ${avg != null && avg > HIGH_FOOD_COST ? "text-danger" : "text-foreground"}`}>{avg != null ? `${avg}%` : "—"}</p>
        </div>
      </div>
      <Link href="/restaurant/kitchen" className="rounded-xl border border-brand bg-brand-soft px-3.5 py-2.5 text-center text-sm font-medium text-brand-text">
        {t("Kitchen stock, wastage and staff meals →")}
      </Link>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((k) => (
          <Link key={k} href={`/restaurant/recipes?tab=${k}`} className={`rounded-full border px-3 py-1 text-xs font-medium ${tab === k ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
            {k === "all" ? t("All dishes") : k === "none" ? t("No recipe yet") : t("Food cost over {n}%", { n: HIGH_FOOD_COST })}
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState text={tab === "none" ? t("Every dish has a recipe.") : t("None here.")} />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {shown.map((r) => (
            <li key={r.id}>
              <Link href={`/restaurant/recipes/${r.id}`} className="neu-card flex items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                  <p className="truncate text-xs text-muted">
                    {r.lines ? t("{n} raw materials · plate costs {cost}", { n: r.lines, cost: formatMoney(r.cost) }) : t("No recipe yet — tap to add")}
                    {r.missing ? ` · ${t("{n} without a price", { n: r.missing })}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-semibold ${r.pct != null && r.pct > HIGH_FOOD_COST ? "text-danger" : "text-foreground"}`}>{r.pct != null ? `${r.pct}%` : "—"}</p>
                  <p className="text-[11px] text-muted">{formatMoney(r.sell)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
