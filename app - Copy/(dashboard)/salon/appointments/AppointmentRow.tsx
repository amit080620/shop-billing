"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAppointmentStatusAction, deleteAppointmentAction } from "@/lib/actions/appointments";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

type Appointment = {
  id: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  stylistName: string | null;
  time: string;
  status: "booked" | "confirmed" | "arrived" | "completed" | "cancelled" | "no_show";
  notes: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  booked: "Booked",
  confirmed: "Confirmed",
  arrived: "Arrived",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};
const STATUS_TONE: Record<string, string> = {
  booked: "bg-background text-muted",
  confirmed: "bg-brand-soft text-brand-text",
  arrived: "bg-credit-soft text-credit",
  completed: "bg-background text-muted",
  cancelled: "bg-danger/15 text-danger",
  no_show: "bg-danger/15 text-danger",
};

function whatsappConfirmLink(a: Appointment, t: (key: string, values?: Record<string, string | number>) => string) {
  const digits = a.customerPhone.replace(/\D/g, "");
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  const message = t("wa.salonConfirm", { name: a.customerName, service: a.serviceName, time: a.time });
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}

export function AppointmentRow({ appointment, lang }: { appointment: Appointment; lang: Lang }) {
  const { t } = useTranslation(lang);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  function setStatus(status: Appointment["status"]) {
    startTransition(async () => {
      const result = await updateAppointmentStatusAction(appointment.id, status);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className={`neu-card p-3.5 ${isCancelling ? "animate-delete" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{appointment.time} · {appointment.serviceName}</p>
          <p className="text-xs text-muted">
            {appointment.customerName} · {appointment.customerPhone}
            {appointment.stylistName ? ` · ${appointment.stylistName}` : ""}
          </p>
          {appointment.notes && <p className="text-xs text-muted">{appointment.notes}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[appointment.status]}`}>
          {STATUS_LABELS[appointment.status]}
        </span>
      </div>

      {error && <p className="mt-1 text-xs text-danger">{error}</p>}

      {appointment.status !== "completed" && appointment.status !== "cancelled" && appointment.status !== "no_show" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {appointment.status === "booked" && (
            <a
              href={whatsappConfirmLink(appointment, t)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-brand bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-text"
            >
              Confirm on WhatsApp
            </a>
          )}
          {appointment.status !== "arrived" && (
            <button onClick={() => setStatus("arrived")} disabled={isPending} className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground disabled:opacity-60">
              Mark arrived
            </button>
          )}
          <button onClick={() => setStatus("completed")} disabled={isPending} className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground disabled:opacity-60">
            Mark completed
          </button>
          <button onClick={() => setStatus("no_show")} disabled={isPending} className="rounded-lg border border-danger px-2.5 py-1 text-xs font-medium text-danger disabled:opacity-60">
            No-show
          </button>
          <button
            onClick={() => {
              if (!confirm("Cancel this appointment?")) return;
              setIsCancelling(true);
              startTransition(async () => {
                await deleteAppointmentAction(appointment.id);
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
