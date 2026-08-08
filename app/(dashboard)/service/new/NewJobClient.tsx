"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createJobAction } from "@/lib/actions/service";
import { PageHeader } from "@/app/components/PageHeader";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import type { Lang } from "@/lib/i18n/dictionary";

type Customer = { id: string; name: string; phone: string };
type JobItem = { name: string; quantity: number; notes: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full text-center disabled:opacity-60">
      {pending ? "Saving…" : "Create job"}
    </button>
  );
}

export function NewJobClient({ customers, lang }: { customers: Customer[]; lang: Lang }) {
  const router = useRouter();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [items, setItems] = useState<JobItem[]>([{ name: "", quantity: 1, notes: "" }]);

  function updateItem(index: number, patch: Partial<JobItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }
  function addItemRow() {
    setItems((prev) => [...prev, { name: "", quantity: 1, notes: "" }]);
  }
  function removeItemRow(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  const [state, formAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await createJobAction(prev, formData);
      if (!result?.error) {
        router.push("/service");
      }
      return result;
    },
    null,
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="New job"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
          </svg>
        }
      />
      <Link href="/service" className="text-sm text-muted">
        ← Jobs
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
            <input
              name="customerPhone"
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              required
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
        </div>

        <input
          type="hidden"
          name="items"
          value={JSON.stringify(items.filter((i) => i.name.trim()).map((i) => ({ name: i.name, quantity: i.quantity, notes: i.notes })))}
        />

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">Items being dropped off</span>
          {items.map((item, i) => (
            <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-2.5">
              <div className="flex gap-2">
                <input
                  value={item.name}
                  onChange={(e) => updateItem(i, { name: e.target.value })}
                  placeholder={i === 0 ? "e.g. Samsung Galaxy phone, cracked screen" : "e.g. Blue shirt"}
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <input
                  type="number"
                  min={1}
                  step="1"
                  value={item.quantity}
                  onChange={(e) => updateItem(i, { quantity: Number(e.target.value) || 1 })}
                  className="w-16 rounded-lg border border-border px-2 py-2 text-sm outline-none focus:border-brand"
                />
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItemRow(i)} className="text-xs font-medium text-danger">
                    Remove
                  </button>
                )}
              </div>
              <input
                value={item.notes}
                onChange={(e) => updateItem(i, { notes: e.target.value })}
                placeholder="Notes for this item (optional)"
                className="rounded-lg border border-border px-3 py-1.5 text-xs outline-none focus:border-brand"
              />
            </div>
          ))}
          <button type="button" onClick={addItemRow} className="self-start text-sm font-medium text-brand">
            + Add another item
          </button>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">What needs to be done? (optional)</span>
          <input
            name="issueDescription"
            placeholder="e.g. Replace screen, check battery"
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Estimated cost (₹, optional)</span>
            <input
              name="estimatedCost"
              type="number"
              min="0"
              step="0.01"
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Expected ready by (optional)</span>
            <input
              name="expectedDate"
              type="date"
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Advance received (₹, optional)</span>
          <input
            name="advancePaid"
            type="number"
            min="0"
            step="0.01"
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <SubmitButton />
      </form>
    </div>
  );
}
