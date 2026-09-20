"use client";

import { keepValuesOnError } from "@/lib/keepValuesOnError";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { createAppointmentAction } from "@/lib/actions/appointments";
import { useToast } from "@/app/components/Toast";
import { PhoneInput } from "@/app/components/PhoneInput";
import { PageHeader } from "@/app/components/PageHeader";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import type { Lang } from "@/lib/i18n/dictionary";
import { CalendarPlus } from "lucide-react";
import { todayIso } from "@/lib/dateHelpers";
import { BackLink } from "@/app/components/BackLink";
import { useTranslation } from "@/lib/i18n/useTranslation";

type Customer = { id: string; name: string; phone: string };
type Service = { id: string; name: string };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full text-center disabled:opacity-60">
      {pending ? pendingLabel : label}
    </button>
  );
}

/** The next half-hour, as "HH:mm" for a time input. */
function nextHalfHour() {
  const d = new Date();
  d.setMinutes(d.getMinutes() > 30 ? 60 : 30, 0, 0);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function NewAppointmentClient({ customers, services, lang }: { customers: Customer[]; services: Service[]; lang: Lang }) {
  const router = useRouter();
  const { t } = useTranslation(lang);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [serviceName, setServiceName] = useState("");

  const { showToast } = useToast();
  const [state, formAction] = useActionState(
    keepValuesOnError(async (prev: { error?: string } | null, formData: FormData) => {
      const result = await createAppointmentAction(prev, formData);
      if (!result?.error) {
        showToast(t("Appointment booked"));
        router.push("/salon/appointments");
      }
      return result;
    }),
    null,
  );

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/salon/appointments" />
      <PageHeader
        title={t("Book appointment")}
        icon={<CalendarPlus size={18} strokeWidth={1.8} />}
      />

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="customerId" value={selectedCustomer?.id ?? ""} />

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{t("Customer")}</span>
          <SearchableSelect
            lang={lang}
            items={customers}
            getKey={(c) => c.id}
            getLabel={(c) => c.name}
            getSubLabel={(c) => c.phone}
            onSelect={(c) => {
              setSelectedCustomer(c);
              setCustomerName(c.name);
              setCustomerPhone(c.phone);
            }}
            placeholder={t("Search existing customer, or just type below")}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">{t("Name")}</span>
            <input
              name="customerName"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">{t("Phone")}</span>
            <PhoneInput value={customerPhone} onChange={setCustomerPhone} required />
            <input type="hidden" name="customerPhone" value={customerPhone} />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{t("Service")}</span>
          <SearchableSelect
            lang={lang}
            items={services}
            getKey={(s) => s.id}
            getLabel={(s) => s.name}
            onSelect={(s) => setServiceName(s.name)}
            placeholder={t("Search your services, or just type below")}
          />
          <input
            name="serviceName"
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
            placeholder={t("e.g. Haircut + beard trim")}
            required
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{t("Stylist / staff (optional)")}</span>
          <input
            name="stylistName"
            placeholder={t("Who's doing it?")}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">{t("Date")}</span>
            <input
              name="appointmentDate"
              type="date"
              defaultValue={todayIso()}
              required
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">{t("Time")}</span>
            <input
              name="appointmentTime"
              type="time"
              defaultValue={nextHalfHour()}
              required
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{t("Notes (optional)")}</span>
          <input
            name="notes"
            placeholder={t("Anything staff should know")}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <SubmitButton label={t("Book appointment")} pendingLabel={t("Booking…")} />
      </form>
    </div>
  );
}
