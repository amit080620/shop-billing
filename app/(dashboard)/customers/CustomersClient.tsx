"use client";

import { useRef, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { createCustomerAction } from "@/lib/actions/customers";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/app/components/EmptyState";
import { PageIcon } from "@/app/components/PageIcon";
import { ContactPickerButton } from "@/app/components/ContactPickerButton";
import { INDIAN_STATES } from "@/lib/constants/states";

type Customer = { id: string; name: string; phone: string; balance: number };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary-sm"
    >
      {pending ? "Saving…" : "Save customer"}
    </button>
  );
}

export function CustomersClient({
  initialCustomers,
}: {
  initialCustomers: Customer[];
}) {
  const [showForm, setShowForm] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");

  const [state, formAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await createCustomerAction(prev, formData);
      if (!result?.error) setShowForm(false);
      return result;
    },
    null,
  );

  const filtered = initialCustomers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PageIcon>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="8" r="3" />
              <path d="M2 20c0-3.3 3-5.5 7-5.5s7 2.2 7 5.5" />
              <circle cx="17" cy="8" r="2.5" />
              <path d="M17 12.7c2.7.4 5 2.4 5 5.3" />
            </svg>
          </PageIcon>
          <h1 className="text-lg font-semibold text-foreground">Customers</h1>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary-sm"
        >
          + Customer
        </button>
      </div>

      {showForm && (
        <form
          action={formAction}
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface shadow-sm p-4"
        >
          <ContactPickerButton
            onPick={(name, phone) => {
              if (nameRef.current) nameRef.current.value = name;
              if (phoneRef.current) phoneRef.current.value = phone;
            }}
          />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Name</span>
            <input
              ref={nameRef}
              name="name"
              required
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Phone</span>
            <input
              ref={phoneRef}
              name="phone"
              type="tel"
              required
              placeholder="For WhatsApp reminders"
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">GSTIN (leave blank for B2C/retail)</span>
            <input
              name="gstin"
              placeholder="22AAAAA0000A1Z5"
              className="rounded-lg border border-border px-3 py-2 text-sm uppercase outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Address (optional)</span>
            <input
              name="address"
              placeholder="Shows on tax invoices for B2B customers"
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">State (for CGST/SGST vs IGST)</span>
            <select
              name="stateCode"
              defaultValue=""
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            >
              <option value="">Not sure / skip</option>
              {INDIAN_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {state?.error && <p className="text-sm text-credit">{state.error}</p>}
          <SubmitButton />
        </form>
      )}

      {initialCustomers.length > 0 && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone"
          className="rounded-lg border border-border bg-surface shadow-sm px-3.5 py-2.5 text-sm outline-none focus:border-brand"
        />
      )}

      {filtered.length === 0 ? (
        <EmptyState text="No customers yet. Add one to start tracking credit." />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((c) => (
            <li key={c.id}>
              <Link
                href={`/customers/${c.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface shadow-sm px-3.5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                  <p className="text-xs text-muted">{c.phone}</p>
                </div>
                <div className="shrink-0 text-right">
                  {c.balance > 0 ? (
                    <p className="text-sm font-semibold text-credit">
                      {formatMoney(c.balance)}
                    </p>
                  ) : (
                    <p className="text-sm text-muted">Settled</p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
