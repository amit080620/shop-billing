import Link from "@/lib/link";
import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { loadGarmentSettings, loadGodowns } from "@/lib/garment/data";
import { garmentGate } from "../gate";
import { StatusChip } from "../ui";
import { StartCount } from "./StartCount";

export default async function CountsPage() {
  const gate = await garmentGate("garment_godowns");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const [{ data: counts }, godowns, settings] = await Promise.all([
    admin.from("godown_counts").select("id, number, count_date, godown_id, blind, purpose, status").eq("shop_id", session.shopId).order("created_at", { ascending: false }).limit(100),
    loadGodowns(admin, session.shopId),
    loadGarmentSettings(admin, session.shopId),
  ]);
  const name = new Map(godowns.map((g) => [g.id, g.name]));
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/garment" />
      <PageHeader title={t("Godown stock count")} subtitle={t("Count, submit, approve, then post only the difference")} icon={<ClipboardList size={18} strokeWidth={1.8} />} />
      <StartCount godowns={godowns.filter((g) => g.isActive).map((g) => ({ id: g.id, name: g.name }))} blindDefault={settings.blindCount} />
      {(counts ?? []).length === 0 ? (
        <p className="neu-card p-4 text-sm text-muted">{t("No counts yet.")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(counts ?? []).map((c) => (
            <li key={c.id}>
              <Link href={`/garment/counts/${c.id}`} className="neu-card flex items-center justify-between gap-3 p-3.5">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">
                    {c.number} <span className="text-xs font-normal text-muted">· {c.count_date}</span>
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {name.get(c.godown_id) ?? "—"}
                    {c.blind && ` · ${t("blind")}`}
                    {c.purpose === "opening" && ` · ${t("opening stock")}`}
                  </span>
                </span>
                <StatusChip status={c.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
