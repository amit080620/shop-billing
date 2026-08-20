import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { GitCompareArrows } from "lucide-react";

export default async function VendorComparisonPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: purchaseItems } = await admin
    .from("purchase_items")
    .select("product_id, description, unit_price, purchases!inner(shop_id, vendor_id, purchase_date, vendors(name))")
    .eq("purchases.shop_id", session.shopId)
    .not("product_id", "is", null)
    .order("purchase_date", { referencedTable: "purchases", ascending: false });

  type VendorPrice = { vendorName: string; price: number; lastBoughtOn: string; timesBought: number };
  const byProduct = new Map<string, { name: string; vendors: Map<string, VendorPrice> }>();

  for (const item of purchaseItems ?? []) {
    if (!item.product_id) continue;
    const purchase = Array.isArray(item.purchases) ? item.purchases[0] : item.purchases;
    if (!purchase) continue;
    const vendor = Array.isArray(purchase.vendors) ? purchase.vendors[0] : purchase.vendors;
    const vendorName = vendor?.name ?? "Unknown vendor";

    const productEntry = byProduct.get(item.product_id) ?? { name: item.description, vendors: new Map() };
    const existing = productEntry.vendors.get(vendorName);
    if (existing) {
      existing.timesBought += 1;
      // purchases were fetched newest-first, so the first row seen for
      // this vendor is genuinely their most recent price — later rows
      // for the same vendor are older and shouldn't overwrite it.
    } else {
      productEntry.vendors.set(vendorName, {
        vendorName,
        price: Number(item.unit_price),
        lastBoughtOn: purchase.purchase_date,
        timesBought: 1,
      });
    }
    byProduct.set(item.product_id, productEntry);
  }

  // Only products genuinely bought from 2+ vendors have anything to
  // compare — a single-vendor product has no alternative to weigh.
  const comparisons = [...byProduct.values()]
    .filter((p) => p.vendors.size >= 2)
    .map((p) => {
      const vendors = [...p.vendors.values()].sort((a, b) => a.price - b.price);
      const cheapest = vendors[0];
      const mostUsed = [...vendors].sort((a, b) => b.timesBought - a.timesBought)[0];
      const potentialSaving =
        mostUsed.vendorName !== cheapest.vendorName ? mostUsed.price - cheapest.price : 0;
      return { name: p.name, vendors, cheapest, mostUsed, potentialSaving };
    })
    .sort((a, b) => b.potentialSaving - a.potentialSaving);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Vendor price comparison"
        subtitle="Same item, different vendors — who's actually cheapest"
        icon={<GitCompareArrows size={18} strokeWidth={1.8} />}
      />

      {comparisons.length === 0 ? (
        <EmptyState text="No product has been bought from more than one vendor yet — nothing to compare." />
      ) : (
        <ul className="flex flex-col gap-2">
          {comparisons.map((c, i) => (
            <li key={i} className="neu-card flex flex-col gap-2 p-4">
              <p className="text-sm font-semibold text-foreground">{c.name}</p>
              <div className="flex flex-col gap-1.5">
                {c.vendors.map((v, j) => (
                  <div key={j} className="flex items-center justify-between text-sm">
                    <span className={v.vendorName === c.cheapest.vendorName ? "font-medium text-success" : "text-muted"}>
                      {v.vendorName}
                      {v.vendorName === c.mostUsed.vendorName && " (usual)"}
                    </span>
                    <span className={v.vendorName === c.cheapest.vendorName ? "font-medium text-success" : "text-foreground"}>
                      {formatMoney(v.price)}
                    </span>
                  </div>
                ))}
              </div>
              {c.potentialSaving > 0 && (
                <p className="rounded-lg bg-success-soft px-2.5 py-1.5 text-xs text-success">
                  Buying from {c.cheapest.vendorName} instead of {c.mostUsed.vendorName} saves{" "}
                  {formatMoney(c.potentialSaving)} per unit.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
