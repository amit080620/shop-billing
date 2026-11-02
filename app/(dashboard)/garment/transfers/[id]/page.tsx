import { notFound } from "next/navigation";
import Link from "@/lib/link";
import { Truck } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { formatMoney, formatDateTime } from "@/lib/format";
import { loadGarmentSettings } from "@/lib/garment/data";
import { TRANSFER_STATUS_LABEL, movementGst, pendingOf, transferActions, type TransferStatus } from "@/lib/garment/rules";
import { garmentGate } from "../../gate";
import { StatusChip } from "../../ui";
import { TransferActions } from "./TransferActions";

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await garmentGate("garment_godowns");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const [{ data: tr }, { data: items }, settings] = await Promise.all([
    admin.from("stock_transfers").select("*").eq("id", id).eq("shop_id", session.shopId).maybeSingle(),
    admin.from("stock_transfer_items").select("*").eq("transfer_id", id).eq("shop_id", session.shopId).order("product_name"),
    loadGarmentSettings(admin, session.shopId),
  ]);
  if (!tr) notFound();
  const { data: gds } = await admin.from("godowns").select("id, name").in("id", [tr.from_godown_id, tr.to_godown_id]);
  const gname = (g: string) => gds?.find((x) => x.id === g)?.name ?? "—";
  const status = tr.status as TransferStatus;
  const lines = (items ?? []).map((i) => ({
    id: i.id,
    name: i.product_name,
    quantity: Number(i.quantity),
    dispatched: Number(i.dispatched),
    received: Number(i.received),
    damaged: Number(i.damaged),
    shortage: Number(i.shortage),
    pending: pendingOf({ dispatched: Number(i.dispatched), received: Number(i.received), damaged: Number(i.damaged), shortage: Number(i.shortage) }),
  }));
  const gst = movementGst({ fromGstin: tr.from_gstin, toGstin: tr.to_gstin, fromState: tr.from_state_code, toState: tr.to_state_code, value: Number(tr.consignment_value) });
  const trail = [
    ["Requested", tr.requested_at],
    ["Approved", tr.approved_at],
    ["Dispatched", tr.dispatched_at],
    ["Received", tr.received_at],
    ["Closed", tr.closed_at],
    ["Cancelled", tr.cancelled_at],
  ].filter(([, at]) => at) as [string, string][];

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/garment/transfers" />
      <PageHeader
        title={`${t("Transfer")} ${tr.number}`}
        subtitle={`${gname(tr.from_godown_id)} → ${gname(tr.to_godown_id)} · ${tr.transfer_date}`}
        icon={<Truck size={18} strokeWidth={1.8} />}
        action={
          <Link href={`/print/garment/transfer/${tr.id}`} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground">
            {t("Print note")}
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={status} label={TRANSFER_STATUS_LABEL[status]} />
        <span className="text-xs text-muted">{formatMoney(Number(tr.consignment_value))}</span>
        {tr.gst_review && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-bold text-warning">{t("GST review")}</span>}
      </div>
      <section className="neu-card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-xs text-muted">
              <th className="px-3 py-2">{t("Item")}</th>
              <th className="px-3 py-2 text-right">{t("Ordered")}</th>
              <th className="px-3 py-2 text-right">{t("Sent")}</th>
              <th className="px-3 py-2 text-right">{t("Received")}</th>
              <th className="px-3 py-2 text-right">{t("Damaged")}</th>
              <th className="px-3 py-2 text-right">{t("Short")}</th>
              <th className="px-3 py-2 text-right">{t("On the way")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2">{l.name}</td>
                <td className="px-3 py-2 text-right">{l.quantity}</td>
                <td className="px-3 py-2 text-right">{l.dispatched}</td>
                <td className="px-3 py-2 text-right text-success">{l.received}</td>
                <td className="px-3 py-2 text-right text-danger">{l.damaged || "—"}</td>
                <td className="px-3 py-2 text-right text-warning">{l.shortage || "—"}</td>
                <td className="px-3 py-2 text-right font-semibold text-secondary">{l.pending || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {/* Keyed by what is still on the way, so the receive form starts afresh after each receipt. */}
      <TransferActions key={`${status}:${lines.map((l) => l.pending).join(",")}`} id={tr.id} actions={transferActions(status, settings.transferApproval)} lines={lines.filter((l) => l.pending > 0).map((l) => ({ id: l.id, name: l.name, pending: l.pending }))} />
      <section className={`flex flex-col gap-1 rounded-xl border p-3.5 text-xs ${gst.review ? "border-warning/40 bg-warning-soft" : "border-border bg-surface-2"}`}>
        {gst.notes.map((n) => (
          <p key={n}>{t(n)}</p>
        ))}
        <p className="text-muted">
          {[tr.movement_reason, tr.transporter && `${t("Transporter")}: ${tr.transporter}`, tr.vehicle_number && `${t("Vehicle")}: ${tr.vehicle_number}`, tr.challan_ref && `${t("Challan")}: ${tr.challan_ref}`, tr.eway_bill_no && `${t("E-way bill")}: ${tr.eway_bill_no}`].filter(Boolean).join(" · ")}
        </p>
      </section>
      {trail.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-muted">
          {trail.map(([label, at]) => (
            <li key={label}>
              {t(label)}: {formatDateTime(at)}
            </li>
          ))}
          {tr.cancel_reason && <li>{t("Why cancelled")}: {tr.cancel_reason}</li>}
        </ul>
      )}
    </div>
  );
}
