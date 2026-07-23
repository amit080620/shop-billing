"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { createVendorAction } from "@/lib/actions/vendors";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/app/components/EmptyState";
import { INDIAN_STATES } from "@/lib/constants/states";

type Vendor = { id: string; name: string; phone: string | null; gstin: string | null; balance: number };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save vendor"}
    </button>
  );
}

export function VendorsClient({ initialVendors }: { initialVendors: Vendor[] }) {
  const [showForm, setShowForm] = useState(false);
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
        <h1 className="text-lg font-semibold text-foreground">Vendors</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white"
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
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Name</span>
            <input
              name="name"
              required
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Phone</span>
            <input
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
