"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { addPaymentAction, cancelBookingAction, checkOutAction } from "@/lib/actions/hotel";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/hotel/constants";
import { computeFolio, toFolioRooms } from "@/lib/hotel/folio";
import type { BookingDetail } from "@/lib/hotel/server";
import { formatMoney, paymentMethodLabel } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";
import { useToast } from "@/app/components/Toast";
import { Sheet } from "../../Sheet";
import { HOTEL_INPUT, HOTEL_LABEL } from "../../ui";
import { ErrorLine, useRun } from "./sheetUtils";

function MethodChips({ value, onChange }: { value: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap gap-2">
      {PAYMENT_METHODS.map((m) => (
        <button key={m} type="button" onClick={() => onChange(m)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${value === m ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
          {t(paymentMethodLabel(m))}
        </button>
      ))}
    </div>
  );
}

export function PaymentSheet({ booking: b, canRefund, onClose }: { booking: BookingDetail; canRefund: boolean; onClose: () => void }) {
  const { t } = useT();
  const { run, isPending, error } = useRun(onClose);
  const [kind, setKind] = useState<"advance" | "payment" | "refund">(b.status === "reserved" ? "advance" : "payment");
  const [amount, setAmount] = useState(b.status === "checked_in" && b.folio.balance > 0 ? String(b.folio.balance) : "");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");

  const kinds: { key: "advance" | "payment" | "refund"; label: string }[] = [
    ...(b.status === "reserved" ? [{ key: "advance" as const, label: t("Advance") }] : [{ key: "payment" as const, label: t("Payment") }]),
    ...(canRefund ? [{ key: "refund" as const, label: t("Refund") }] : []),
  ];

  return (
    <Sheet title={kind === "refund" ? t("Refund to guest") : b.status === "reserved" ? t("Take an advance") : t("Take a payment")} onClose={onClose}>
      {kinds.length > 1 && (
        <div className="flex gap-2">
          {kinds.map((k) => (
            <button key={k.key} type="button" onClick={() => setKind(k.key)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${kind === k.key ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
              {k.label}
            </button>
          ))}
        </div>
      )}
      {b.folio.balance > 0 && kind !== "refund" && (
        <p className="text-xs text-muted">
          {t("Balance due")}: <span className="font-semibold text-foreground">{formatMoney(b.folio.balance)}</span>
        </p>
      )}
      <label className={HOTEL_LABEL}>
        {t("Amount (₹)")}
        <input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className={HOTEL_INPUT} autoFocus />
      </label>
      <MethodChips value={method} onChange={setMethod} />
      <label className={HOTEL_LABEL}>
        {t("Reference (optional)")}
        <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t("UPI ref / receipt no.")} className={HOTEL_INPUT} />
      </label>
      <ErrorLine error={error} />
      <button type="button" disabled={isPending} onClick={() => run(() => addPaymentAction({ bookingId: b.id, kind, amount: Number(amount), method, reference }), t("Saved"))} className="btn-primary disabled:opacity-60">
        {isPending ? t("Saving…") : kind === "refund" ? t("Record refund") : t("Record payment")}
      </button>
    </Sheet>
  );
}

type PayRow = { key: number; method: PaymentMethod; amount: string };
let rowSeq = 0;

export function CheckOutSheet({ booking: b, canDiscount, onClose }: { booking: BookingDetail; canDiscount: boolean; onClose: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [discount, setDiscount] = useState("");
  const [rows, setRows] = useState<PayRow[]>([{ key: ++rowSeq, method: "cash", amount: b.folio.balance > 0 ? String(b.folio.balance) : "" }]);
  const [leaveUnpaid, setLeaveUnpaid] = useState(false);
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>("cash");

  const discountNumber = Math.max(0, Number(discount) || 0);
  const newPayments = rows.filter((r) => Number(r.amount) > 0).map((r) => ({ method: r.method, amount: Number(r.amount) }));

  const folio = useMemo(
    () =>
      computeFolio({
        rooms: toFolioRooms(b.rooms, b.nights),
        charges: b.charges,
        roomService: b.roomService,
        payments: [...b.payments, ...newPayments.map((p, i) => ({ id: `n${i}`, kind: "payment" as const, amount: p.amount, method: p.method }))],
        discount: discountNumber,
      }),
    // newPayments is derived from rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [b, discountNumber, rows],
  );
  const withoutNew = useMemo(
    () => computeFolio({ rooms: toFolioRooms(b.rooms, b.nights), charges: b.charges, roomService: b.roomService, payments: b.payments, discount: discountNumber }),
    [b, discountNumber],
  );
  const owed = folio.balance;
  const overpaid = folio.refundDue;
  const needsPhone = leaveUnpaid && owed > 0 && !b.customerId && !b.guestPhone;

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await checkOutAction({ bookingId: b.id, discount: discountNumber, payments: newPayments, leaveUnpaid, refundMethod });
      if (r.error) return setError(r.error);
      showToast(t("Checked out"));
      onClose();
      if (r.billId) router.push(`/print/bill/${r.billId}?new=1`);
      else router.refresh();
    });
  }

  return (
    <Sheet title={t("Check out")} onClose={onClose} wide>
      <div className="flex flex-col gap-1 rounded-xl bg-surface-2 p-3 text-sm">
        {folio.items.map((it, i) => (
          <div key={i} className="flex justify-between gap-3">
            <span className="min-w-0 truncate text-muted">{it.description}</span>
            <span className="shrink-0 text-foreground">{formatMoney(it.quantity * it.unitPrice)}</span>
          </div>
        ))}
        {folio.totals.discountAmount > 0 && (
          <div className="flex justify-between text-muted">
            <span>{t("Discount")}</span>
            <span>− {formatMoney(folio.totals.discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between text-muted">
          <span>{t("GST")}</span>
          <span>{formatMoney(folio.totals.gstAmount)}</span>
        </div>
        <div className="flex justify-between font-semibold text-foreground">
          <span>{t("Stay invoice")}</span>
          <span>{formatMoney(folio.invoiceTotal)}</span>
        </div>
        {folio.roomServiceTotal > 0 && (
          <div className="flex justify-between text-muted">
            <span>
              {t("Room service")} ({b.roomService.length})
            </span>
            <span>{formatMoney(folio.roomServiceTotal)}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-border pt-1.5 text-base font-bold text-foreground">
          <span>{t("Total")}</span>
          <span>{formatMoney(folio.grandTotal)}</span>
        </div>
        <div className="flex justify-between text-muted">
          <span>{t("Already received")}</span>
          <span>{formatMoney(withoutNew.paid)}</span>
        </div>
        <div className="flex justify-between font-semibold text-foreground">
          <span>{t("To collect now")}</span>
          <span>{formatMoney(withoutNew.balance)}</span>
        </div>
      </div>

      {canDiscount && (
        <label className={HOTEL_LABEL}>
          {t("Discount on room & extras (₹, before tax)")}
          <input type="number" inputMode="decimal" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} className={HOTEL_INPUT} />
        </label>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-muted">{t("Payment received now")}</p>
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <select
              value={row.method}
              onChange={(e) => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, method: e.target.value as PaymentMethod } : r)))}
              aria-label={t("Paid via")}
              className="rounded-lg border border-border bg-surface px-2 py-2 text-xs text-foreground outline-none focus:border-brand"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(paymentMethodLabel(m))}
                </option>
              ))}
            </select>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={row.amount}
              onChange={(e) => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, amount: e.target.value } : r)))}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
            />
            {rows.length > 1 && (
              <button type="button" onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))} aria-label={t("Remove")} className="text-muted hover:text-danger">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setRows((prev) => [...prev, { key: ++rowSeq, method: "upi", amount: "" }])} className="flex w-fit items-center gap-1 text-xs font-medium text-brand-text">
          <Plus size={12} /> {t("Split payment")}
        </button>
      </div>

      {owed > 0.009 && (
        <label className="flex items-start gap-2 rounded-lg bg-credit-soft px-3 py-2.5 text-sm text-foreground">
          <input type="checkbox" checked={leaveUnpaid} onChange={(e) => setLeaveUnpaid(e.target.checked)} className="mt-1" />
          <span>
            {t("Keep")} <b>{formatMoney(owed)}</b> {t("as due on the guest's account (udhaar)")}
            {needsPhone && <span className="mt-1 block text-xs text-danger">{t("Add the guest's mobile number first (Edit guest).")}</span>}
          </span>
        </label>
      )}
      {overpaid > 0.009 && (
        <div className="flex flex-col gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-foreground">
          <p>
            {t("The guest has paid")} <b>{formatMoney(overpaid)}</b> {t("more than the bill — return it via:")}
          </p>
          <MethodChips value={refundMethod} onChange={setRefundMethod} />
        </div>
      )}

      <ErrorLine error={error} />
      <button type="button" disabled={isPending || needsPhone || (owed > 0.009 && !leaveUnpaid)} onClick={submit} className="btn-primary disabled:opacity-50">
        {isPending ? t("Checking out…") : owed > 0.009 && !leaveUnpaid ? `${t("Collect")} ${formatMoney(owed)} ${t("more")}` : t("Check out & make invoice")}
      </button>
    </Sheet>
  );
}

export function CancelSheet({ booking: b, onClose }: { booking: BookingDetail; onClose: () => void }) {
  const { t } = useT();
  const { run, isPending, error } = useRun(onClose);
  const [outcome, setOutcome] = useState<"cancelled" | "no_show">(b.checkIn < new Date().toISOString().slice(0, 10) ? "no_show" : "cancelled");
  const [reason, setReason] = useState("");
  const [keep, setKeep] = useState("");
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>("cash");
  const paid = b.folio.paid;
  const keepNumber = Math.max(0, Number(keep) || 0);
  const refund = Math.max(0, paid - keepNumber);

  return (
    <Sheet title={t("Cancel booking")} onClose={onClose}>
      <div className="flex gap-2">
        {(["cancelled", "no_show"] as const).map((o) => (
          <button key={o} type="button" onClick={() => setOutcome(o)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${outcome === o ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
            {o === "cancelled" ? t("Guest cancelled") : t("Guest didn't come (no-show)")}
          </button>
        ))}
      </div>
      <label className={HOTEL_LABEL}>
        {t("Reason (optional)")}
        <input value={reason} onChange={(e) => setReason(e.target.value)} className={HOTEL_INPUT} />
      </label>
      {paid > 0 ? (
        <>
          <p className="text-sm text-muted">
            {t("Received so far")}: <b className="text-foreground">{formatMoney(paid)}</b>
          </p>
          <label className={HOTEL_LABEL}>
            {t("Cancellation charge you keep (₹, tax included)")}
            <input type="number" inputMode="decimal" min={0} max={paid} value={keep} onChange={(e) => setKeep(e.target.value)} placeholder="0" className={HOTEL_INPUT} />
            <span className="font-normal">{t("A GST invoice is made for the amount you keep.")}</span>
          </label>
          {refund > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-foreground">
                {t("Return to guest")}: <b>{formatMoney(refund)}</b>
              </p>
              <MethodChips value={refundMethod} onChange={setRefundMethod} />
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-muted">{t("No money has been received on this booking.")}</p>
      )}
      <ErrorLine error={error} />
      <button type="button" disabled={isPending} onClick={() => run(() => cancelBookingAction({ bookingId: b.id, reason, outcome, keepAmount: keepNumber, refundMethod }), t("Booking closed"))} className="rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
        {isPending ? t("Saving…") : outcome === "no_show" ? t("Mark as no-show") : t("Cancel this booking")}
      </button>
    </Sheet>
  );
}
