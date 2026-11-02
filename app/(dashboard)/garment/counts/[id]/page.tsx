import { notFound } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { loadStockGrid } from "@/lib/garment/data";
import { canDecide, garmentGate } from "../../gate";
import { StatusChip } from "../../ui";
import { CountClient } from "./CountClient";

export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await garmentGate("garment_godowns");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const { data: c } = await admin.from("godown_counts").select("*").eq("id", id).eq("shop_id", session.shopId).maybeSingle();
  if (!c) notFound();
  const [{ data: godown }, { data: lines }, grid] = await Promise.all([
    admin.from("godowns").select("name").eq("id", c.godown_id).maybeSingle(),
    admin.from("godown_count_items").select("id, product_id, product_name, system_qty, physical_qty, posted_difference").eq("count_id", id).order("product_name"),
    c.status === "counting" ? loadStockGrid(admin, session.shopId) : Promise.resolve(null),
  ]);
  const decider = canDecide(session);
  // A blind count hides the system figure from whoever is counting; the approver sees it after submit.
  const hideSystem = c.blind && (c.status === "counting" || !decider);
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/garment/counts" />
      <PageHeader title={`${t("Godown count")} ${c.number}`} subtitle={`${godown?.name ?? "—"} · ${c.count_date}${c.blind ? ` · ${t("blind")}` : ""}`} icon={<ClipboardList size={18} strokeWidth={1.8} />} />
      <div className="flex items-center gap-2">
        <StatusChip status={c.status} />
        {c.purpose === "opening" && <span className="text-xs text-muted">{t("opening stock")}</span>}
      </div>
      <CountClient
        id={c.id}
        status={c.status}
        hideSystem={hideSystem}
        canDecide={decider}
        items={
          grid
            ? grid.rows.map((r) => ({ id: r.id, name: r.name, sku: r.sku, barcode: r.barcode, system: r.cells[c.godown_id]?.saleable ?? 0 }))
            : []
        }
        lines={(lines ?? []).map((l) => ({ id: l.id, name: l.product_name, system: Number(l.system_qty), physical: Number(l.physical_qty), posted: l.posted_difference === null ? null : Number(l.posted_difference) }))}
      />
      {c.note && <p className="text-xs text-muted">{c.note}</p>}
    </div>
  );
}
