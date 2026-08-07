"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateClinicAppointmentStatusAction, deleteClinicAppointmentAction } from "@/lib/actions/clinic";

type Appointment = {
  id: string;
  patientName: string;
  patientPhone: string;
  reasonForVisit: string | null;
  time: string;
  doctorName: string | null;
  status: "booked" | "confirmed" | "arrived" | "in_consultation" | "completed" | "cancelled" | "no_show";
  notes: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  booked: "Booked",
  confirmed: "Confirmed",
  arrived: "Arrived",
  in_consultation: "In consultation",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};
const STATUS_TONE: Record<string, string> = {
  booked: "bg-background text-muted",
  confirmed: "bg-brand-soft text-brand-dark",
  arrived: "bg-credit-soft text-credit",
  in_consultation: "bg-credit-soft text-credit",
  completed: "bg-background text-muted",
  cancelled: "bg-danger/15 text-danger",
  no_show: "bg-danger/15 text-danger",
};

export function ClinicAppointmentRow({ appointment }: { appointment: Appointment }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function setStatus(status: Appointment["status"]) {
    startTransition(async () => {
      const result = await updateClinicAppointmentStatusAction(appointment.id, status);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const rxLink = `/clinic/prescriptions/new?appointmentId=${appointment.id}&patientName=${encodeURIComponent(appointment.patientName)}&patientPhone=${encodeURIComponent(appointment.patientPhone)}`;

  return (
    <li className="rounded-xl border border-border bg-surface shadow-sm p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{appointment.time} · {appointment.patientName}</p>
          <p className="text-xs text-muted">
            {appointment.patientPhone}
            {appointment.doctorName ? ` · ${appointment.doctorName}` : ""}
          </p>
          {appointment.reasonForVisit && <p className="text-xs text-muted">{appointment.reasonForVisit}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[appointment.status]}`}>
          {STATUS_LABELS[appointment.status]}
        </span>
      </div>

      {error && <p className="mt-1 text-xs text-danger">{error}</p>}

      {appointment.status !== "completed" && appointment.status !== "cancelled" && appointment.status !== "no_show" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {appointment.status !== "arrived" && appointment.status !== "in_consultation" && (
            <button onClick={() => setStatus("arrived")} disabled={isPending} className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground disabled:opacity-60">
              Mark arrived
            </button>
          )}
          <Link href={rxLink} className="rounded-lg border border-brand bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-dark">
            📝 Write prescription
          </Link>
          <button onClick={() => setStatus("no_show")} disabled={isPending} className="rounded-lg border border-danger px-2.5 py-1 text-xs font-medium text-danger disabled:opacity-60">
            No-show
          </button>
          <button
            onClick={() => {
              if (!confirm("Cancel this appointment?")) return;
              startTransition(async () => {
                await deleteClinicAppointmentAction(appointment.id);
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
