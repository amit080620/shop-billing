"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createReservationAction } from "@/lib/actions/reservations";
import { useToast } from "@/app/components/Toast";
import { PhoneInput } from "@/app/components/PhoneInput";
import { PageHeader } from "@/app/components/PageHeader";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import type { Lang } from "@/lib/i18n/dictionary";
import { CalendarPlus } from "lucide-react";
import { todayIso } from "@/lib/dateHelpers";

type Customer = { id: string; name: string; phone: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full text-center disabled:opacity-60">
      {pending ? "Booking…" : "Book reservation"}
    </button>
  );
}

export function NewReservationClient({ customers, tables, lang }: { customers: Customer[]; tables: { id: string; name: string }[]; lang: Lang }) {
  const router = useRouter();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const { showToast } = useToast();
  const [state, formAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await createReservationAction(prev, formData);
      if (!result?.error) {
        showToast("Reservation booked");
        router.push("/restaurant/reservations");
      }
      return result;
    },
    null,
  );

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Book reservation"
        icon={<CalendarPlus size={18} strokeWidth={1.8} />}
      />
      <Link href="/restaurant/reservations" className="text-sm text-muted">
        ← Reservations
      </Link>

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="customerId" value={selectedCustomer?.id ?? ""} />

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Customer</span>
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
            placeholder="Search existing customer, or just type below"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Name</span>
            <input
              name="customerName"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Phone</span>
            <PhoneInput value={customerPhone} onChange={setCustomerPhone} required />
            <input type="hidden" name="customerPhone" value={customerPhone} />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Date</span>
            <input name="reservationDate" type="date" defaultValue={todayIso()} required className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Time</span>
            <input name="reservationTime" type="time" required className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Guests</span>
            <input name="partySize" type="number" min="1" step="1" defaultValue={2} required className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Table (optional — blocks it for this slot)</span>
          <select name="tableId" className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand">
            <option value="">No specific table</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Token / advance amount (₹, optional)</span>
          <input
            name="tokenAmount"
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 500"
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <span className="text-xs text-muted">Automatically deducted from their final bill when they&apos;re seated and billed.</span>
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
