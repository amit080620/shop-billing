import { RotateCcw } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { loadGodowns } from "@/lib/garment/data";
import { garmentGate } from "../gate";
import { PlaceReturns } from "./PlaceReturns";

/** Customer returns come back onto the shop floor (the existing returns screen does that). Here
 * each returned piece is placed: kept on the floor, sent to a godown, or marked damaged, for
 * inspection or for repair — which opens an approved damage report. */
export default async function ReturnsToGodownPage() {
  const gate = await garmentGate("garment_godowns");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const [{ data: returns }, godowns] = await Promise.all([
    admin.from("returns").select("id, return_number, created_at").eq("shop_id", session.shopId).gte("created_at", since).order("created_at", { ascending: false }).limit(150),
    loadGodowns(admin, session.shopId),
  ]);
  const ids = (returns ?? []).map((r) => r.id);
  const [{ data: items }, { data: placed }] = ids.length
    ? await Promise.all([
        admin.from("return_items").select("id, return_id, product_id, product_name, quantity, stock_back").in("return_id", ids),
        admin.from("return_dispositions").select("return_item_id, quantity").eq("shop_id", session.shopId).in("return_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const done = new Map<string, number>();
  for (const p of placed ?? []) done.set(p.return_item_id, (done.get(p.return_item_id) ?? 0) + Number(p.quantity));
  const byReturn = new Map((returns ?? []).map((r) => [r.id, r]));
  const lines = (items ?? [])
    .filter((i) => i.product_id)
    .map((i) => {
      const back = i.stock_back == null ? Number(i.quantity) : Number(i.stock_back);
      const r = byReturn.get(i.return_id)!;
      return { id: i.id, name: i.product_name, returnNumber: r.return_number, at: r.created_at, left: Math.round((back - (done.get(i.id) ?? 0)) * 1000) / 1000 };
    })
    .filter((l) => l.left > 0)
    .sort((a, b) => b.at.localeCompare(a.at));
  const floor = godowns.find((g) => g.isDefault);

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/garment" />
      <PageHeader title={t("Customer returns → godown")} subtitle={t("Returns of the last 90 days still on the shop floor")} icon={<RotateCcw size={18} strokeWidth={1.8} />} />
      {!floor ? (
        <p className="neu-card p-4 text-sm text-muted">{t("Mark the shop floor the counter sells from first (Godowns).")}</p>
      ) : (
        <PlaceReturns lines={lines} floorId={floor.id} godowns={godowns.filter((g) => g.isActive).map((g) => ({ id: g.id, name: g.name }))} />
      )}
    </div>
  );
}
