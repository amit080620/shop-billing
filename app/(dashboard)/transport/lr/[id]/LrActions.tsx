"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { billConsignmentsAction, setConsignmentStatusAction } from "@/lib/actions/consignments";
import { formatMoney, paymentMethodLabel } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";

type Method = "cash" | "upi" | "card" | "online" | "other";

/** Moving an LR along (on the way, delivered), billing its freight, sharing and printing it. */
export function LrActions({
  id,
  status,
  payBy,
  total,
  billId,
  consigneeName,
  isOwner,
  share,
}: {
  id: string;
  status: "booked" | "in_transit" | "delivered" | "cancelled";
  payBy: "paid" | "to_pay" | "tbb";
  total: number;
  billId: string | null;
  consigneeName: string;
  isOwner: boolean;
  share: { consignee: string | null; consignor: string | null; driver: string | null };
}) {
  const { t } = useT();
  const router = useRouter();
  const [mode, setMode] = useState<"deliver" | "bill" | null>(null);
  const [receivedBy, setReceivedBy] = useState(consigneeName);
  const [note, setNote] = useState("");
  const [gst, setGst] = useState(0);
  const [paid, setPaid] = useState<number | "">(payBy === "tbb" ? 0 : total);
  // The bill comes to the freight plus GST on top (rounded to the rupee, as every bill is).
  const billTotal = Math.round(total * (1 + gst / 100));
  const [method, setMethod] = useState<Method>("cash");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand";

  function run(fn: () => Promise<{ error?: string; billId?: string }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.error) {
        setError(r.error);
        return;
      }
      setMode(null);
      if (r.billId) router.push(`/print/bill/${r.billId}`);
      else router.refresh();
    });
  }

  const cancelled = status === "cancelled";
  return (
    <section className="flex flex-col gap-2">
      {!cancelled && status === "booked" && (
        <button type="button" disabled={pending} onClick={() => run(() => setConsignmentStatusAction(id, "in_transit"))} className="btn-primary text-center disabled:opacity-60">
          {t("Dispatched — on the way")}
        </button>
      )}
      {!cancelled && status !== "delivered" && mode !== "deliver" && (
        <button type="button" onClick={() => setMode("deliver")} className={status === "in_transit" ? "btn-primary text-center" : "rounded-xl border border-brand px-4 py-2.5 text-center text-sm font-medium text-brand-text"}>
          {t("Mark delivered")}
        </button>
      )}
      {mode === "deliver" && (
        <div className="neu-card flex flex-col gap-2 p-3.5">
          <input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder={t("Received by")} aria-label={t("Received by")} className={input} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Note (e.g. 2 bags torn)")} className={input} />
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => run(() => setConsignmentStatusAction(id, "delivered", { receivedBy, note }))} className="btn-primary flex-1 text-center disabled:opacity-60">
              {pending ? t("Saving…") : t("Delivered")}
            </button>
            <button type="button" onClick={() => setMode(null)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
              {t("Cancel")}
            </button>
          </div>
        </div>
      )}

      {!cancelled && (billId ? (
        <Link href={`/print/bill/${billId}`} className="rounded-xl border border-success bg-success-soft px-4 py-2.5 text-center text-sm font-medium text-success">
          {t("Freight billed — open the bill →")}
        </Link>
      ) : mode === "bill" ? (
        <div className="neu-card flex flex-col gap-2 p-3.5">
          <p className="text-sm font-semibold text-foreground">
            {t("Freight bill")} · {formatMoney(billTotal)}
            {gst > 0 && <span className="text-xs font-normal text-muted"> ({formatMoney(total)} + GST {gst}%)</span>}
          </p>
          <label className="flex flex-col gap-1 text-[11px] text-muted">
            GST
            <select
              value={gst}
              onChange={(e) => {
                const next = Number(e.target.value);
                // Still asking for the whole bill? Keep it the whole bill at the new GST.
                if (paid === billTotal) setPaid(Math.round(total * (1 + next / 100)));
                setGst(next);
              }}
              className={input}
            >
              <option value={0}>{t("0% — reverse charge (the party pays GST)")}</option>
              <option value={5}>5%</option>
              <option value={12}>12%</option>
              <option value={18}>18%</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] text-muted">
              {t("Received now ₹")}
              <input type="number" min={0} value={paid} onChange={(e) => setPaid(e.target.value === "" ? "" : Number(e.target.value))} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-muted">
              {t("Payment method")}
              <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className={input}>
                {(["cash", "upi", "card", "online", "other"] as const).map((m) => (
                  <option key={m} value={m}>
                    {t(paymentMethodLabel(m))}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-muted">{t("Whatever isn't received now goes on the party's udhaar.")}</p>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => run(() => billConsignmentsAction({ ids: [id], gstPercent: gst, paidAmount: typeof paid === "number" ? paid : 0, paymentMethod: method }))} className="btn-primary flex-1 text-center disabled:opacity-60">
              {pending ? t("Saving…") : t("Make bill")}
            </button>
            <button type="button" onClick={() => setMode(null)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
              {t("Cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setMode("bill")} className="rounded-xl border border-brand bg-brand-soft px-4 py-2.5 text-center text-sm font-medium text-brand-text">
          {t("Make freight bill — {amount}", { amount: formatMoney(total) })}
        </button>
      ))}

      <div className="flex flex-wrap gap-2">
        {share.consignee && (
          <a href={share.consignee} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[#25D366] px-3 py-1.5 text-xs font-medium text-[#128C7E]">
            {t("WhatsApp to receiver")}
          </a>
        )}
        {share.consignor && (
          <a href={share.consignor} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[#25D366] px-3 py-1.5 text-xs font-medium text-[#128C7E]">
            {t("WhatsApp to sender")}
          </a>
        )}
        {share.driver && (
          <a href={share.driver} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[#25D366] px-3 py-1.5 text-xs font-medium text-[#128C7E]">
            {t("WhatsApp to driver")}
          </a>
        )}
        <Link href={`/print/lr/${id}`} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground">
          {t("Print / PDF")}
        </Link>
        {!billId && !cancelled && (
          <Link href={`/transport/lr/new?edit=${id}`} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground">
            {t("Edit")}
          </Link>
        )}
        {status === "delivered" && (
          <button type="button" disabled={pending} onClick={() => run(() => setConsignmentStatusAction(id, "in_transit"))} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted">
            {t("Not delivered yet")}
          </button>
        )}
        {isOwner && !billId && !cancelled && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm(t("Cancel this LR? Its number stays used."))) run(() => setConsignmentStatusAction(id, "cancelled"));
            }}
            className="rounded-full border border-danger px-3 py-1.5 text-xs font-medium text-danger"
          >
            {t("Cancel LR")}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  );
}
