import Link from "@/lib/link";
import { Truck } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { formatMoney } from "@/lib/format";
import { TRANSFER_STATUS_LABEL, type TransferStatus } from "@/lib/garment/rules";
import { garmentGate } from "../gate";
import { StatusChip } from "../ui";

const FILTERS: { key: string; label: string; statuses: TransferStatus[] }[] = [
  { key: "open", label: "Open", statuses: ["draft", "requested", "approved", "dispatched", "partially_received", "received"] },
  { key: "transit", label: "In transit", statuses: ["dispatched", "partially_received"] },
  { key: "done", label: "Closed", statuses: ["closed"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
];

export default async function TransfersPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const gate = await garmentGate("garment_godowns");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const { f = "open" } = await searchParams;
  const filter = FILTERS.find((x) => x.key === f) ?? FILTERS[0];
  const [{ data: transfers }, { data: godowns }] = await Promise.all([
    admin.from("stock_transfers").select("id, number, transfer_date, status, from_godown_id, to_godown_id, consignment_value, gst_review").eq("shop_id", session.shopId).in("status", filter.statuses).order("created_at", { ascending: false }).limit(200),
    admin.from("godowns").select("id, name").eq("shop_id", session.shopId),
  ]);
  const name = new Map((godowns ?? []).map((g) => [g.id, g.name]));
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/garment" />
      <PageHeader
        title={t("Transfers")}
        subtitle={t("Godown to godown, with stock in transit until received")}
        icon={<Truck size={18} strokeWidth={1.8} />}
        action={
          <Link href="/garment/transfers/new" className="btn-primary-sm">
            + {t("Transfer")}
          </Link>
        }
      />
      <nav className="flex flex-wrap gap-1.5" aria-label={t("Filter")}>
        {FILTERS.map((x) => (
          <Link key={x.key} href={`/garment/transfers?f=${x.key}`} aria-current={x.key === filter.key ? "page" : undefined} className={`rounded-full px-3 py-1 text-xs font-semibold ${x.key === filter.key ? "bg-brand text-white" : "border border-border text-foreground"}`}>
            {t(x.label)}
          </Link>
        ))}
      </nav>
      {(transfers ?? []).length === 0 ? (
        <p className="neu-card p-4 text-sm text-muted">{t("Nothing here.")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(transfers ?? []).map((tr) => (
            <li key={tr.id}>
              <Link href={`/garment/transfers/${tr.id}`} className="neu-card flex items-center justify-between gap-3 p-3.5">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">
                    {tr.number} <span className="text-xs font-normal text-muted">· {tr.transfer_date}</span>
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {name.get(tr.from_godown_id)} → {name.get(tr.to_godown_id)} · {formatMoney(Number(tr.consignment_value))}
                    {tr.gst_review && ` · ${t("GST review")}`}
                  </span>
                </span>
                <StatusChip status={tr.status} label={TRANSFER_STATUS_LABEL[tr.status as keyof typeof TRANSFER_STATUS_LABEL]} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
