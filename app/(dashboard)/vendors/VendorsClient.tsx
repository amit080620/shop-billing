"use client";

import { useRef, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { createVendorAction } from "@/lib/actions/vendors";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/app/components/EmptyState";
import { PageIcon } from "@/app/components/PageIcon";
import { ContactPickerButton } from "@/app/components/ContactPickerButton";
import { INDIAN_STATES } from "@/lib/constants/states";

type Vendor = { id: string; name: string; phone: string | null; gstin: string | null; balance: number };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary-sm"
    >
      {pending ? "Saving…" : "Save vendor"}
    </button>
  );
}

export function VendorsClient({ initialVendors }: { initialVendors: Vendor[] }) {
  const [showForm, setShowForm] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");

  const [state, formAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await createVendorAction(prev, formData);
      if (!result?.error) setShowForm(false);
      return result;
    },
    null,
  );

  const filtered = initialVendors.filter(
    (v) =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      (v.phone ?? "").includes(search),
  );

  const totalPayable = initialVendors.reduce((s, v) => s + v.balance, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PageIcon>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1.5" y="7" width="13" height="9" rx="1" />
              <path d="M14.5 10h4l3 3v3h-7z" />
              <circle cx="6" cy="18" r="1.7" />
              <circle cx="17.5" cy="18" r="1.7" />
            </svg>
          </PageIcon>
          <h1 className="text-lg font-semibold text-foreground">Vendors</h1>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary-sm"
        >
          + Vendor
        </button>
      </div>

      {totalPayable > 0 && (
        <div className="rounded-xl border border-border bg-credit-soft p-4">
          <p className="text-xs text-credit">Total you owe vendors</p>
          <p className="mt-1 text-xl font-semibold text-credit">{formatMoney(totalPayable)}</p>
        </div>
      )}

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
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">GSTIN (optional)</span>
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

      {initialVendors.length > 0 && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone"
          className="rounded-lg border border-border bg-surface shadow-sm px-3.5 py-2.5 text-sm outline-none focus:border-brand"
        />
      )}

      {filtered.length === 0 ? (
        <EmptyState text="No vendors yet. Add one to start recording purchases." />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((v) => (
            <li key={v.id}>
              <Link
                href={`/vendors/${v.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface shadow-sm px-3.5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{v.name}</p>
                  <p className="truncate text-xs text-muted">
                    {v.gstin ? v.gstin : v.phone || "No GSTIN on file"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {v.balance > 0 ? (
                    <p className="text-sm font-semibold text-credit">{formatMoney(v.balance)}</p>
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
