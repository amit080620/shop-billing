import { notFound } from "next/navigation";
import { ChefHat } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { isModuleEnabled } from "@/lib/modules";
import { formatMoney } from "@/lib/format";
import { ingredientCosts, loadRecipeMap, recipesReady } from "@/lib/recipeData";
import { RecipeEditor } from "./RecipeEditor";

export default async function RecipePage({ params }: { params: Promise<{ dishId: string }> }) {
  const { dishId } = await params;
  const { t } = await getTranslator();
  const session = await requireSession();
  if (!isModuleEnabled(session.enabledModules, "recipe_stock")) return <ModuleBlocked moduleKey="recipe_stock" />;
  const admin = createSupabaseAdminClient();
  if (!/^[0-9a-f-]{36}$/i.test(dishId) || !(await recipesReady(admin))) notFound();

  const [{ data: dish }, recipes, { data: raws }] = await Promise.all([
    admin.from("products").select("id, name, price, offer_price, gst_percent, is_raw_material").eq("id", dishId).eq("shop_id", session.shopId).maybeSingle(),
    loadRecipeMap(admin, session.shopId, [dishId]),
    // Raw materials, and anything else counted in stock (a bottle that goes with a thali).
    admin.from("products").select("id, name, unit, stock_quantity, is_raw_material").eq("shop_id", session.shopId).eq("track_inventory", true).neq("id", dishId).order("name"),
  ]);
  if (!dish || dish.is_raw_material) notFound();
  const costs = await ingredientCosts(admin, session.shopId, (raws ?? []).map((r) => r.id));
  const price = Number(dish.offer_price && Number(dish.offer_price) > 0 ? dish.offer_price : dish.price);
  const sellBeforeGst = session.priceIncludesGst ? price / (1 + Number(dish.gst_percent) / 100) : price;
  // Raw materials first in the list; other stocked items after them.
  const list = [...(raws ?? [])].sort((a, b) => Number(b.is_raw_material) - Number(a.is_raw_material) || a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/restaurant/recipes" />
      <PageHeader title={dish.name} icon={<ChefHat size={18} strokeWidth={1.8} />} />
      <p className="text-xs text-muted">
        {t("Sells for {price} before GST", { price: formatMoney(sellBeforeGst) })}
      </p>
      <RecipeEditor
        dishId={dish.id}
        sellBeforeGst={Math.round(sellBeforeGst * 100) / 100}
        rawMaterials={list.map((r) => ({ id: r.id, name: r.name, unit: r.unit, stock: Number(r.stock_quantity), cost: costs.get(r.id) ?? null }))}
        initial={recipes.get(dish.id) ?? []}
      />
    </div>
  );
}
