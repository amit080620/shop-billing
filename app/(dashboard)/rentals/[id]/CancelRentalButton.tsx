"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelRentalAction } from "@/lib/actions/rentals";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";

/** Cancels a booking that has not gone out yet, and records what was handed back. */
export function CancelRentalButton({ rentalId, paidAmount }: { rentalId: string; paidAmount: number }) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState<number | "">(paidAmount);
  const [method, setMethod] = useState<"cash" | "upi" | "card" | "online">("cash");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger">
        {t("Cancel this booking")}
      </button>
    );
  }

  function confirm() {
    setError(null);
    start(async () => {
      const r = await cancelRentalAction(rentalId, reason, { amount: typeof refund === "number" ? refund : 0, method });
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-danger/40 bg-surface p-4">
      <p className="text-sm font-semibold text-foreground">{t("Cancel this booking")}</p>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("Reason (e.g. event postponed)")} className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
      {paidAmount > 0 && (
        <>
          <p className="text-xs text-muted">
            {t("Paid so far")}: {formatMoney(paidAmount)}. {t("How much is handed back?")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              max={paidAmount}
              step="0.01"
              value={refund}
              onChange={(e) => setRefund(e.target.value === "" ? "" : Number(e.target.value))}
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="cash">{t("Cash")}</option>
              <option value="upi">UPI</option>
              <option value="card">{t("Card")}</option>
              <option value="online">{t("Online")}</option>
            </select>
          </div>
        </>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={confirm} disabled={pending} className="flex-1 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {pending ? t("Saving…") : t("Cancel booking")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
          {t("Keep it")}
        </button>
      </div>
    </div>
  );
}
