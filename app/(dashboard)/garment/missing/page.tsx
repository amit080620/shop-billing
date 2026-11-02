import Link from "@/lib/link";
import { PackageMinus } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { loadGodowns, loadStockGrid } from "@/lib/garment/data";
import { canDecide, garmentGate } from "../gate";
import { MissingClient } from "./MissingClient";

const OPEN = ["reported", "investigation", "reviewed", "approved", "adjusted", "rejected"] as const;

/** Missing stock and other differences between the system and the shelf. Recording one never
 * changes stock: it is investigated, reviewed, approved, and only then adjusted. */
export default async function MissingPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const gate = await garmentGate("garment_godowns");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const { f = "open" } = await searchParams;
  const closed = f === "closed";
  const [{ data: rows }, godowns, grid] = await Promise.all([
    admin.from("stock_discrepancies").select("id, number, report_date, godown_id, product_name, kind, system_qty, physical_qty, difference, estimated_value, reason, investigation_notes, resolution, status, transfer_id").eq("shop_id", session.shopId).in("status", closed ? (["closed"] as const) : OPEN).order("created_at", { ascending: false }).limit(200),
    loadGodowns(admin, session.shopId),
    loadStockGrid(admin, session.shopId),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/garment" />
      <PageHeader title={t("Missing stock")} subtitle={t("Differences are recorded first and adjusted only after approval")} icon={<PackageMinus size={18} strokeWidth={1.8} />} />
      <nav className="flex gap-1.5" aria-label={t("Filter")}>
        {[
          { key: "open", label: t("Open"), on: !closed },
          { key: "closed", label: t("Closed"), on: closed },
        ].map((x) => (
          <Link key={x.key} href={`/garment/missing?f=${x.key}`} aria-current={x.on ? "page" : undefined} className={`rounded-full px-3 py-1 text-xs font-semibold ${x.on ? "bg-brand text-white" : "border border-border text-foreground"}`}>
            {x.label}
          </Link>
        ))}
      </nav>
      <MissingClient
        godowns={godowns.filter((g) => g.isActive).map((g) => ({ id: g.id, name: g.name }))}
        godownName={Object.fromEntries(godowns.map((g) => [g.id, g.name]))}
        stock={grid.rows.map((r) => ({ id: r.id, name: r.name, sku: r.sku, barcode: r.barcode, byGodown: Object.fromEntries(Object.entries(r.cells).map(([k, c]) => [k, c.saleable])) }))}
        rows={(rows ?? []).map((r) => ({
          id: r.id,
          number: r.number,
          date: r.report_date,
          godownId: r.godown_id,
          name: r.product_name,
          kind: r.kind,
          system: Number(r.system_qty),
          physical: Number(r.physical_qty),
          difference: Number(r.difference),
          value: Number(r.estimated_value),
          reason: r.reason,
          notes: r.investigation_notes,
          resolution: r.resolution,
          status: r.status,
          transferId: r.transfer_id,
        }))}
        canDecide={canDecide(session)}
      />
    </div>
  );
}
