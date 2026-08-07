"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateReservationStatusAction, deleteReservationAction } from "@/lib/actions/reservations";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

type Reservation = {
  id: string;
  customerName: string;
  customerPhone: string;
  partySize: number;
  time: string;
  tablePreference: string | null;
  status: "booked" | "confirmed" | "seated" | "cancelled" | "no_show";
  notes: string | null;
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
  confirmed: "bg-brand-soft text-brand-dark",
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

  function setStatus(status: Reservation["status"]) {
    startTransition(async () => {
      const result = await updateReservationStatusAction(reservation.id, status);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-border bg-surface shadow-sm p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{reservation.time} · {reservation.partySize} pax</p>
          <p className="text-xs text-muted">
            {reservation.customerName} · {reservation.customerPhone}
            {reservation.tablePreference ? ` · ${reservation.tablePreference}` : ""}
          </p>
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
              className="rounded-lg border border-brand bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-dark"
            >
              💬 Confirm on WhatsApp
            </a>
          )}
          <button onClick={() => setStatus("seated")} disabled={isPending} className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground disabled:opacity-60">
            Mark seated
          </button>
          <button onClick={() => setStatus("no_show")} disabled={isPending} className="rounded-lg border border-danger px-2.5 py-1 text-xs font-medium text-danger disabled:opacity-60">
            No-show
          </button>
          <button
            onClick={() => {
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
    </li>
  );
}
