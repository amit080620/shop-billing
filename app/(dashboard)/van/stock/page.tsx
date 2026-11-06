import { Boxes } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { loadStockByPlace } from "@/lib/van/data";
import { vanGate } from "../gate";

const q = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, ""));

/** Stock in every place: the main godown, each van, and damaged stock. */
export default async function VanStockPage() {
  const gate = await vanGate(true);
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const { places, rows } = await loadStockByPlace(admin, session.shopId);
  const shown = places.filter((p) => p.isDefault || p.kind === "vehicle");
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/van" />
      <PageHeader title={t("Stock by place")} subtitle={t("Main godown, each van and damaged stock")} icon={<Boxes size={18} strokeWidth={1.8} />} />
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("No stock yet.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="sticky left-0 bg-surface px-3 py-2 font-medium">{t("Item")}</th>
                {shown.map((p) => (
                  <th key={p.id} className="px-2 py-2 text-right font-medium">
                    {p.name}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-medium">{t("Damaged")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("Total")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="sticky left-0 bg-surface px-3 py-1.5 text-foreground">
                    {r.name} <span className="text-xs text-muted">{r.unit}</span>
                  </td>
                  {shown.map((p) => {
                    const v = r.byPlace.get(p.id) ?? 0;
                    return (
                      <td key={p.id} className={`px-2 py-1.5 text-right ${v < 0 ? "font-semibold text-danger" : v === 0 ? "text-muted" : "text-foreground"}`}>
                        {q(v)}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-right text-muted">{q(r.damaged)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-foreground">{q(r.saleable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">{t("Total is the stock that can be sold (godown + vans). Damaged pieces are kept apart and can't be billed.")}</p>
    </div>
  );
}
