import Link from "@/lib/link";
import { Boxes } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { loadStockGrid } from "@/lib/garment/data";
import { garmentGate } from "../gate";

/** Every size and colour at every godown: saleable (the shop floor's = the rest of the total), damaged,
 * on the way and short in transit. A negative shop floor means the counter sold beyond it. */
export default async function StockGridPage({ searchParams }: { searchParams: Promise<{ q?: string; style?: string }> }) {
  const gate = await garmentGate("garment_godowns");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const { q = "", style } = await searchParams;
  const grid = await loadStockGrid(admin, session.shopId, { styleId: style });
  const needle = q.trim().toLowerCase();
  const rows = needle ? grid.rows.filter((r) => r.name.toLowerCase().includes(needle) || r.sku?.toLowerCase().includes(needle) || r.barcode === q.trim()) : grid.rows;
  const def = grid.godowns.find((g) => g.isDefault)?.id;

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/garment" />
      <PageHeader
        title={t("Stock by godown")}
        subtitle={t("Saleable at each place; damaged, on the way and short shown apart")}
        icon={<Boxes size={18} strokeWidth={1.8} />}
        action={
          <span className="flex gap-2">
            <Link href="/garment/move" className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground">
              {t("Move")}
            </Link>
            <Link href="/garment/transfers/new" className="btn-primary-sm">
              {t("Transfer")}
            </Link>
          </span>
        }
      />
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder={t("Search style, colour, size, SKU or barcode")} className="w-full rounded-lg px-3 py-2 text-sm" />
        <button type="submit" className="btn-primary-sm">
          {t("Search")}
        </button>
      </form>
      {grid.godowns.length === 0 ? (
        <p className="neu-card p-4 text-sm text-muted">
          {t("Add your godowns first.")}{" "}
          <Link href="/garment/godowns" className="font-semibold text-brand-text">
            {t("Godowns")} →
          </Link>
        </p>
      ) : (
        <section className="neu-card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2 text-left text-xs text-muted">
                <th className="sticky left-0 bg-surface-2 px-3 py-2">{t("Item")}</th>
                {grid.godowns.map((g) => (
                  <th key={g.id} className="whitespace-nowrap px-3 py-2 text-right">
                    {g.name}
                    {g.isDefault && <span className="block text-[10px] font-normal">{t("sells here")}</span>}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">{t("On the way")}</th>
                <th className="px-3 py-2 text-right">{t("Saleable")}</th>
                <th className="px-3 py-2 text-right">{t("Physical")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={grid.godowns.length + 4} className="px-3 py-6 text-center text-muted">
                    {t("No items match.")}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className={r.total <= r.lowStock ? "bg-warning-soft/40" : ""}>
                  <td className="sticky left-0 bg-surface px-3 py-2">
                    <span className="block font-medium text-foreground">{r.name}</span>
                    {(r.sku || r.barcode) && <span className="block text-[11px] text-muted">{r.sku ?? r.barcode}</span>}
                  </td>
                  {grid.godowns.map((g) => {
                    const c = r.cells[g.id];
                    return (
                      <td key={g.id} className={`px-3 py-2 text-right ${g.id === def && c.saleable < 0 ? "font-bold text-danger" : ""}`}>
                        {c.saleable}
                        {c.damaged > 0 && <span className="block text-[11px] text-danger">{t("{n} damaged", { n: c.damaged })}</span>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right text-secondary">
                    {r.transit || "—"}
                    {r.pending > 0 && <span className="block text-[11px] text-warning">{t("{n} short", { n: r.pending })}</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">{r.total}</td>
                  <td className="px-3 py-2 text-right text-muted">{r.physical}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <p className="text-xs text-muted">{t("Saleable is what the counter can bill (all godowns). Physical adds damaged stock still in the shop. On the way and short-in-transit goods are neither, until received or settled.")}</p>
    </div>
  );
}
