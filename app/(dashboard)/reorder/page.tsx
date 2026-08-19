import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { PackagePlus } from "lucide-react";
import { ReorderClient } from "./ReorderClient";

export default async function ReorderPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const [{ data: products }, { data: vendors }] = await Promise.all([
    admin
      .from("products")
      .select("id, name, unit, stock_quantity, low_stock_threshold")
      .eq("shop_id", session.shopId)
      .eq("track_inventory", true)
      .order("name"),
    admin.from("vendors").select("id, name, phone").eq("shop_id", session.shopId).order("name"),
  ]);

  const lowStock = (products ?? [])
    .filter((p) => Number(p.stock_quantity) <= Number(p.low_stock_threshold))
    .map((p) => {
      const stock = Number(p.stock_quantity);
      const threshold = Number(p.low_stock_threshold);
      return {
        id: p.id,
        name: p.name,
        unit: p.unit,
        stock,
        threshold,
        // Suggest enough to get back above the threshold with a little
        // headroom, rather than just to the threshold itself — restocking
        // to exactly the alert level would put it right back on this list.
        suggestedQty: Math.max(1, Math.ceil(threshold * 1.5 - stock)),
      };
    });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reorder stock"
        subtitle="What's running low — send it to a vendor in one tap"
        icon={<PackagePlus size={18} strokeWidth={1.8} />}
      />

      {lowStock.length === 0 ? (
        <EmptyState text="Nothing is running low right now." />
      ) : (
        <ReorderClient items={lowStock} vendors={vendors ?? []} shopName={session.shopName} />
      )}
    </div>
  );
}
