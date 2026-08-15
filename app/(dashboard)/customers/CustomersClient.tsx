"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { createCustomerAction } from "@/lib/actions/customers";
import { useToast } from "@/app/components/Toast";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/app/components/EmptyState";
import { PageHeader } from "@/app/components/PageHeader";
import { Popup } from "@/app/components/Popup";
import { ContactPickerButton } from "@/app/components/ContactPickerButton";
import { INDIAN_STATES } from "@/lib/constants/states";
import { BulkImportExportCustomers } from "./BulkImportExportCustomers";

type Customer = {
  id: string;
  name: string;
  phone: string;
  balance: number;
  gstin?: string | null;
  address?: string | null;
  stateCode?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  bloodGroup?: string | null;
  knownAllergies?: string | null;
};

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
  isClinic,
  isGym,
  page,
  pageSize,
  totalCount,
  initialSearch,
  bulkImportExportEnabled,
}: {
  initialCustomers: Customer[];
  isClinic: boolean;
  isGym: boolean;
  page: number;
  pageSize: number;
  totalCount: number;
  initialSearch: string;
  bulkImportExportEnabled: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState(initialSearch);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const { showToast } = useToast();
  const [state, formAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await createCustomerAction(prev, formData);
      if (!result?.error) {
        setShowForm(false);
        showToast(`${isClinic ? "Patient" : isGym ? "Member" : "Customer"} added`);
      }
      return result;
    },
    null,
  );

  // Server-side search — debounced so typing doesn't fire a request
  // per keystroke. Resets to page 1 whenever the query changes.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      router.push(`/customers${params.toString() ? `?${params.toString()}` : ""}`);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function goToPage(nextPage: number) {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    params.set("page", String(nextPage));
    router.push(`/customers?${params.toString()}`);
  }

  const filtered = initialCustomers;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={isClinic ? "Patients" : isGym ? "Members" : "Customers"}
        // eslint-disable-next-line @next/next/no-img-element -- small branded SVG icon
        icon={<img src="/assets/ray-icons/customer.svg" alt="" className="h-9 w-9 md:h-11 md:w-11" />}
        bareIcon
        action={
          <button onClick={() => setShowForm((v) => !v)} className="btn-primary-sm">
            + {isClinic ? "Patient" : isGym ? "Member" : "Customer"}
          </button>
        }
      />

      {bulkImportExportEnabled && <BulkImportExportCustomers isClinic={isClinic} isGym={isGym} onImported={() => router.refresh()} />}

      {showForm && (
        <Popup open={showForm} onClose={() => setShowForm(false)} title={isClinic ? "New patient" : isGym ? "New member" : "New customer"}>
        <form
          action={formAction}
          className="flex flex-col gap-3"
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
        </Popup>
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
        <EmptyState text="No customers yet — add your first one to start tracking sales and credit." />
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
          {filtered.map((c) => (
            <li key={c.id}>
              <Link
                href={`/customers/${c.id}`}
                className="hover-lift flex items-center justify-between gap-3 rounded-lg border border-border bg-surface shadow-sm px-3.5 py-3"
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-2.5">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-40"
          >
            ← Previous
          </button>
          <p className="text-xs text-muted">
            Page {page} of {totalPages} · {totalCount} total
          </p>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
