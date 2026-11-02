import Link from "@/lib/link";
import { RotateCcw } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { formatMoney } from "@/lib/format";
import { loadGodowns, loadStockGrid } from "@/lib/garment/data";
import { garmentGate } from "../../gate";
import { NewSupplierReturnClient } from "./NewSupplierReturnClient";

/** Vendor → one of their purchases → what goes back. A line can return at most what was bought
 * (with free pieces) less what earlier posted returns already sent back. */
export default async function NewSupplierReturnPage({ searchParams }: { searchParams: Promise<{ vendor?: string; purchase?: string }> }) {
  const gate = await garmentGate("supplier_returns");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const { vendor: vendorId, purchase: purchaseId } = await searchParams;
  const header = <PageHeader title={t("New supplier return")} icon={<RotateCcw size={18} strokeWidth={1.8} />} />;

  if (!purchaseId) {
    const { data: vendors } = await admin.from("vendors").select("id, name").eq("shop_id", session.shopId).order("name").limit(500);
    const { data: purchases } = vendorId
      ? await admin.from("purchases").select("id, vendor_invoice_number, purchase_date, total").eq("shop_id", session.shopId).eq("vendor_id", vendorId).order("purchase_date", { ascending: false }).limit(50)
      : { data: [] };
    return (
      <div className="flex flex-col gap-4">
        <BackLink fallback="/garment/supplier-returns" />
        {header}
        <form className="neu-card flex flex-wrap items-end gap-2 p-4" method="get">
          <label className="flex-1 text-xs text-muted">
            {t("Supplier")}
            <select name="vendor" defaultValue={vendorId ?? ""} className="w-full rounded-lg px-3 py-2 text-sm">
              <option value="">{t("Choose…")}</option>
              {(vendors ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn-primary-sm">
            {t("Show purchases")}
          </button>
        </form>
        {vendorId && (
          (purchases ?? []).length === 0 ? (
            <p className="neu-card p-4 text-sm text-muted">{t("No purchases from this vendor.")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(purchases ?? []).map((p) => (
                <li key={p.id}>
                  <Link href={`/garment/supplier-returns/new?vendor=${vendorId}&purchase=${p.id}`} className="neu-card flex items-center justify-between gap-3 p-3.5 text-sm">
                    <span className="font-semibold text-foreground">{p.vendor_invoice_number}</span>
                    <span className="text-xs text-muted">
                      {p.purchase_date} · {formatMoney(Number(p.total))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    );
  }

  const { data: purchase } = await admin.from("purchases").select("id, vendor_id, vendor_invoice_number, purchase_date").eq("id", purchaseId).eq("shop_id", session.shopId).maybeSingle();
  if (!purchase) return <p className="neu-card p-4 text-sm text-muted">{t("Purchase not found.")}</p>;
  const [{ data: items }, { data: posted }, { data: vendor }, godowns, grid] = await Promise.all([
    admin.from("purchase_items").select("id, product_id, description, quantity, free_quantity, unit_price, gst_percent").eq("purchase_id", purchase.id),
    admin.from("purchase_returns").select("id").eq("shop_id", session.shopId).eq("purchase_id", purchase.id).eq("status", "posted"),
    admin.from("vendors").select("name").eq("id", purchase.vendor_id).maybeSingle(),
    loadGodowns(admin, session.shopId),
    loadStockGrid(admin, session.shopId),
  ]);
  const postedIds = (posted ?? []).map((r) => r.id);
  const { data: back } = postedIds.length ? await admin.from("purchase_return_items").select("purchase_item_id, quantity").in("return_id", postedIds) : { data: [] };
  const returned = new Map<string, number>();
  for (const b of back ?? []) returned.set(b.purchase_item_id, (returned.get(b.purchase_item_id) ?? 0) + Number(b.quantity));
  const productIds = (items ?? []).map((i) => i.product_id).filter((x): x is string => !!x);
  const { data: damage } = productIds.length
    ? await admin.from("damage_reports").select("id, number, godown_id, product_id, quantity").eq("shop_id", session.shopId).eq("status", "approved").in("product_id", productIds)
    : { data: [] };
  const cells = new Map(grid.rows.map((r) => [r.id, r.cells]));

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback={`/garment/supplier-returns/new?vendor=${purchase.vendor_id}`} />
      {header}
      <p className="text-sm text-muted">
        {vendor?.name} · {t("Purchase")} {purchase.vendor_invoice_number} · {purchase.purchase_date}
      </p>
      <NewSupplierReturnClient
        purchaseId={purchase.id}
        godowns={godowns.filter((g) => g.isActive).map((g) => ({ id: g.id, name: g.name }))}
        lines={(items ?? [])
          .filter((i) => i.product_id)
          .map((i) => ({
            id: i.id,
            productId: i.product_id as string,
            name: i.description,
            rate: Number(i.unit_price),
            gst: Number(i.gst_percent),
            eligible: Math.max(0, Number(i.quantity) + Number(i.free_quantity ?? 0) - (returned.get(i.id) ?? 0)),
            stock: Object.fromEntries(Object.entries(cells.get(i.product_id as string) ?? {}).map(([g, c]) => [g, { saleable: c.saleable, damaged: c.damaged }])),
          }))}
        damage={(damage ?? []).map((d) => ({ id: d.id, number: d.number, godownId: d.godown_id, productId: d.product_id as string, quantity: Number(d.quantity) }))}
      />
    </div>
  );
}
