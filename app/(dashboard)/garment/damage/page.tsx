import Link from "@/lib/link";
import { PackageX } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { loadGodowns, loadStockGrid } from "@/lib/garment/data";
import { canDecide, garmentGate } from "../gate";
import { DamageClient } from "./DamageClient";

const OPEN = ["reported", "under_review", "approved"] as const;
const DONE = ["rejected", "dispositioned"] as const;

/** Damage register: reported → under review → approved (the pieces leave saleable stock for the
 * godown's damaged stock) or rejected → what happens to them (repair, discount sale, scrap…). */
export default async function DamagePage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const gate = await garmentGate("garment_godowns");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const { f = "open" } = await searchParams;
  const done = f === "done";
  const [{ data: reports }, godowns, grid] = await Promise.all([
    admin.from("damage_reports").select("id, number, report_date, godown_id, product_name, quantity, reason, description, estimated_value, status, disposition, decision_note, source_return_item_id").eq("shop_id", session.shopId).in("status", done ? DONE : OPEN).order("created_at", { ascending: false }).limit(200),
    loadGodowns(admin, session.shopId),
    loadStockGrid(admin, session.shopId),
  ]);
  const active = godowns.filter((g) => g.isActive);
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/garment" />
      <PageHeader title={t("Damage register")} subtitle={t("Reporting doesn't move stock; approving moves it to damaged stock")} icon={<PackageX size={18} strokeWidth={1.8} />} />
      <nav className="flex gap-1.5" aria-label={t("Filter")}>
        {[
          { key: "open", label: t("Open") },
          { key: "done", label: t("Decided") },
        ].map((x) => (
          <Link key={x.key} href={`/garment/damage?f=${x.key}`} aria-current={(x.key === "done") === done ? "page" : undefined} className={`rounded-full px-3 py-1 text-xs font-semibold ${(x.key === "done") === done ? "bg-brand text-white" : "border border-border text-foreground"}`}>
            {x.label}
          </Link>
        ))}
      </nav>
      <DamageClient
        godowns={active.map((g) => ({ id: g.id, name: g.name }))}
        godownName={Object.fromEntries(godowns.map((g) => [g.id, g.name]))}
        stock={grid.rows.map((r) => ({ id: r.id, name: r.name, sku: r.sku, barcode: r.barcode, byGodown: Object.fromEntries(Object.entries(r.cells).map(([k, c]) => [k, c.saleable])) }))}
        reports={(reports ?? []).map((r) => ({
          id: r.id,
          number: r.number,
          date: r.report_date,
          godownId: r.godown_id,
          name: r.product_name,
          quantity: Number(r.quantity),
          reason: r.reason,
          description: r.description,
          value: Number(r.estimated_value),
          status: r.status,
          disposition: r.disposition,
          note: r.decision_note,
          fromReturn: !!r.source_return_item_id,
        }))}
        canDecide={canDecide(session)}
      />
    </div>
  );
}
