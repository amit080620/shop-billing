import { notFound } from "next/navigation";
import { Shirt } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { isModuleEnabled } from "@/lib/modules";
import { loadGodowns, loadStockGrid, loadVariants } from "@/lib/garment/data";
import { formatMoney } from "@/lib/format";
import { garmentGate } from "../../gate";
import { StyleDetailClient } from "./StyleDetailClient";

export default async function StylePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await garmentGate(null);
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const { data: style } = await admin.from("product_styles").select("*").eq("id", id).eq("shop_id", session.shopId).maybeSingle();
  if (!style) notFound();
  const godownsOn = isModuleEnabled(session.enabledModules, "garment_godowns");
  const godowns = await loadGodowns(admin, session.shopId);
  const variants = await loadVariants(admin, session.shopId, { styleId: id });
  const grid = godownsOn && godowns.length ? await loadStockGrid(admin, session.shopId, { styleId: id }) : null;
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/garment/styles" />
      <PageHeader
        title={style.name}
        subtitle={[style.code, style.brand, style.fabric, style.season, style.hsn_code ? `HSN ${style.hsn_code}` : null, `GST ${Number(style.gst_percent)}%`].filter(Boolean).join(" · ")}
        icon={<Shirt size={18} strokeWidth={1.8} />}
      />
      <section className="neu-card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-xs text-muted">
              <th className="px-3 py-2">{t("Colour")}</th>
              <th className="px-3 py-2">{t("Size")}</th>
              <th className="px-3 py-2">{t("SKU / barcode")}</th>
              <th className="px-3 py-2 text-right">{t("Price")}</th>
              {grid ? grid.godowns.map((g) => <th key={g.id} className="px-3 py-2 text-right">{g.name}</th>) : <th className="px-3 py-2 text-right">{t("Stock")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {variants.map((v) => {
              const row = grid?.rows.find((r) => r.id === v.id);
              return (
                <tr key={v.id}>
                  <td className="px-3 py-2">{v.colour ?? "—"}</td>
                  <td className="px-3 py-2 font-semibold">{v.size ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted">{[v.sku, v.barcode].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(v.price)}</td>
                  {grid && row
                    ? grid.godowns.map((g) => (
                        <td key={g.id} className={`px-3 py-2 text-right ${row.cells[g.id]?.saleable < 0 ? "font-bold text-danger" : ""}`}>
                          {row.cells[g.id]?.saleable ?? 0}
                          {(row.cells[g.id]?.damaged ?? 0) > 0 && <span className="block text-[11px] text-danger">{t("{n} damaged", { n: row.cells[g.id].damaged })}</span>}
                        </td>
                      ))
                    : <td className="px-3 py-2 text-right">{v.total}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <StyleDetailClient
        styleId={id}
        isOwner={session.role === "owner"}
        godowns={godowns.filter((g) => g.isActive).map((g) => ({ id: g.id, name: g.name, isDefault: g.isDefault }))}
        variants={variants.map((v) => ({ id: v.id, name: v.name, sku: v.sku, barcode: v.barcode }))}
      />
    </div>
  );
}
