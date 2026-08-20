"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClinicAppointmentAction } from "@/lib/actions/clinic";
import { useToast } from "@/app/components/Toast";
import { PhoneInput } from "@/app/components/PhoneInput";
import { PageHeader } from "@/app/components/PageHeader";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import type { Lang } from "@/lib/i18n/dictionary";
import { CalendarPlus } from "lucide-react";
import { todayIso } from "@/lib/dateHelpers";

type Patient = { id: string; name: string; phone: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full text-center disabled:opacity-60">
      {pending ? "Booking…" : "Book appointment"}
    </button>
  );
}

export function NewClinicAppointmentClient({ patients, lang }: { patients: Patient[]; lang: Lang }) {
  const router = useRouter();
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");

  const { showToast } = useToast();
  const [state, formAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await createClinicAppointmentAction(prev, formData);
      if (!result?.error) {
        showToast("Appointment booked");
        router.push("/clinic/appointments");
      }
      return result;
    },
    null,
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Book appointment"
        icon={<CalendarPlus size={18} strokeWidth={1.8} />}
      />
      <Link href="/clinic/appointments" className="text-sm text-muted">
        ← Appointments
      </Link>

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="patientId" value={selectedPatient?.id ?? ""} />

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Patient</span>
          <SearchableSelect
            lang={lang}
            items={patients}
            getKey={(p) => p.id}
            getLabel={(p) => p.name}
            getSubLabel={(p) => p.phone}
            onSelect={(p) => {
              setSelectedPatient(p);
              setPatientName(p.name);
              setPatientPhone(p.phone);
            }}
            placeholder="Search existing patient, or just type below"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Name</span>
            <input
              name="patientName"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              required
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Phone</span>
            <PhoneInput value={patientPhone} onChange={setPatientPhone} required />
            <input type="hidden" name="patientPhone" value={patientPhone} />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Reason for visit (optional)</span>
          <input
            name="reasonForVisit"
            placeholder="e.g. Fever, follow-up"
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Date</span>
            <input name="appointmentDate" type="date" defaultValue={todayIso()} required className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Time</span>
            <input name="appointmentTime" type="time" required className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Doctor (optional)</span>
          <input
            name="doctorName"
            placeholder="If more than one doctor sees patients here"
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Notes (optional)</span>
          <input
            name="notes"
            placeholder="Anything staff should know"
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <SubmitButton />
      </form>
    </div>
  );
}
