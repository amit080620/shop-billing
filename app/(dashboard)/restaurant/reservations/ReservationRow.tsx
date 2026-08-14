"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateReservationStatusAction, deleteReservationAction } from "@/lib/actions/reservations";
import { MessageCircle, Divide, Ban } from "lucide-react";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { formatMoney } from "@/lib/format";
import type { Lang } from "@/lib/i18n/dictionary";

type Reservation = {
  id: string;
  customerName: string;
  customerPhone: string;
  partySize: number;
  time: string;
  tableName: string | null;
  status: "booked" | "confirmed" | "seated" | "cancelled" | "no_show";
  notes: string | null;
  tokenAmount: number;
};

const STATUS_LABELS: Record<string, string> = {
  booked: "Booked",
  confirmed: "Confirmed",
  seated: "Seated",
  cancelled: "Cancelled",
  no_show: "No-show",
};
const STATUS_TONE: Record<string, string> = {
  booked: "bg-background text-muted",
  confirmed: "bg-brand-soft text-brand-text",
  seated: "bg-credit-soft text-credit",
  cancelled: "bg-danger/15 text-danger",
  no_show: "bg-danger/15 text-danger",
};

function whatsappConfirmLink(r: Reservation, t: (key: string, values?: Record<string, string | number>) => string) {
  const digits = r.customerPhone.replace(/\D/g, "");
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  const message = t("wa.reservationConfirm", { name: r.customerName, partySize: r.partySize, time: r.time });
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}

export function ReservationRow({ reservation, lang }: { reservation: Reservation; lang: Lang }) {
  const { t } = useTranslation(lang);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [refundFlow, setRefundFlow] = useState<"cancelled" | "no_show" | null>(null);

  function setStatus(status: Reservation["status"], refund?: { refundType: "none" | "partial" | "full"; refundAmount: number }) {
    startTransition(async () => {
      const result = await updateReservationStatusAction(reservation.id, status, refund);
      if (result.error) {
        setError(result.error);
        return;
      }
      setRefundFlow(null);
      router.refresh();
    });
  }

  // A token was collected — cancelling/no-show needs a refund decision
  // before it's final, since "the money just disappears" is exactly
  // the kind of silent surprise that causes disputes later.
  function requestStop(status: "cancelled" | "no_show") {
    if (reservation.tokenAmount > 0) {
      setRefundFlow(status);
    } else {
      setStatus(status);
    }
  }

  return (
    <li className="rounded-xl border border-border bg-surface shadow-sm p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{reservation.time} · {reservation.partySize} pax</p>
          <p className="text-xs text-muted">
            {reservation.customerName} · {reservation.customerPhone}
            {reservation.tableName ? ` · ${reservation.tableName}` : ""}
          </p>
          {reservation.tokenAmount > 0 && <p className="text-xs text-brand">Token collected: {formatMoney(reservation.tokenAmount)}</p>}
          {reservation.notes && <p className="text-xs text-muted">{reservation.notes}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[reservation.status]}`}>
          {STATUS_LABELS[reservation.status]}
        </span>
      </div>

      {error && <p className="mt-1 text-xs text-danger">{error}</p>}

      {reservation.status !== "seated" && reservation.status !== "cancelled" && reservation.status !== "no_show" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {reservation.status === "booked" && (
            <a
              href={whatsappConfirmLink(reservation, t)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg border border-brand bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-text"
            >
              <MessageCircle size={12} /> Confirm on WhatsApp
            </a>
          )}
          <button onClick={() => setStatus("seated")} disabled={isPending} className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground disabled:opacity-60">
            Mark seated
          </button>
          <button onClick={() => requestStop("no_show")} disabled={isPending} className="rounded-lg border border-danger px-2.5 py-1 text-xs font-medium text-danger disabled:opacity-60">
            No-show
          </button>
          <button
            onClick={() => {
              if (reservation.tokenAmount > 0) {
                requestStop("cancelled");
                return;
              }
              if (!confirm("Cancel this reservation?")) return;
              startTransition(async () => {
                await deleteReservationAction(reservation.id);
                router.refresh();
              });
            }}
            disabled={isPending}
            className="rounded-lg border border-danger px-2.5 py-1 text-xs font-medium text-danger disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      )}

      {refundFlow && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setRefundFlow(null)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-surface p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground">
              {refundFlow === "cancelled" ? "Cancel" : "Mark no-show for"} {reservation.customerName}
            </p>
            <p className="mt-1 text-xs text-muted">
              A token of {formatMoney(reservation.tokenAmount)} was collected. What happens to it?
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                onClick={() => setStatus(refundFlow, { refundType: "full", refundAmount: reservation.tokenAmount })}
                disabled={isPending}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-left text-sm text-foreground disabled:opacity-60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- small branded SVG icon */}
                <img src="/assets/ray-icons/refund.svg" alt="" className="h-4 w-4" /> Full refund — {formatMoney(reservation.tokenAmount)} back to customer
              </button>
              <button
                onClick={() => setStatus(refundFlow, { refundType: "partial", refundAmount: reservation.tokenAmount / 2 })}
                disabled={isPending}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-left text-sm text-foreground disabled:opacity-60"
              >
                <Divide size={14} /> 50% refund — {formatMoney(reservation.tokenAmount / 2)} back, {formatMoney(reservation.tokenAmount / 2)} kept
              </button>
              <button
                onClick={() => setStatus(refundFlow, { refundType: "none", refundAmount: 0 })}
                disabled={isPending}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-left text-sm text-foreground disabled:opacity-60"
              >
                <Ban size={14} /> No refund — full {formatMoney(reservation.tokenAmount)} kept
              </button>
            </div>
            <button onClick={() => setRefundFlow(null)} className="mt-3 w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
