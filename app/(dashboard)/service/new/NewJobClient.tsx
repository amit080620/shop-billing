"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createJobAction } from "@/lib/actions/service";
import { useToast } from "@/app/components/Toast";
import { PageHeader } from "@/app/components/PageHeader";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import type { Lang } from "@/lib/i18n/dictionary";
import { Wrench } from "lucide-react";

type Customer = { id: string; name: string; phone: string };
type JobItem = { name: string; quantity: number; notes: string };

type Identifier = { label: string; value: string };

const CATEGORIES = [
  { key: "mobile", label: "Mobile", suggested: ["IMEI"] },
  { key: "bike", label: "Bike", suggested: ["Chassis No.", "Registration No."] },
  { key: "car", label: "Car", suggested: ["Chassis No.", "Registration No.", "Engine No."] },
  { key: "laptop", label: "Laptop", suggested: ["Serial No."] },
  { key: "appliance", label: "Appliance", suggested: ["Model No.", "Serial No."] },
  { key: "other", label: "Other", suggested: [] },
] as const;

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
  const [deviceCategory, setDeviceCategory] = useState<string | null>(null);
  const [identifiers, setIdentifiers] = useState<Identifier[]>([]);

  function pickCategory(key: string) {
    setDeviceCategory(key);
    const cat = CATEGORIES.find((c) => c.key === key);
    setIdentifiers((cat?.suggested ?? []).map((label) => ({ label, value: "" })));
  }
  function updateIdentifier(index: number, patch: Partial<Identifier>) {
    setIdentifiers((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }
  function addIdentifierRow() {
    setIdentifiers((prev) => [...prev, { label: "", value: "" }]);
  }
  function removeIdentifierRow(index: number) {
    setIdentifiers((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(index: number, patch: Partial<JobItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }
  function addItemRow() {
    setItems((prev) => [...prev, { name: "", quantity: 1, notes: "" }]);
  }
  function removeItemRow(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  const { showToast } = useToast();
  const [state, formAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await createJobAction(prev, formData);
      if (!result?.error) {
        showToast("Job card created");
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
        icon={<Wrench size={18} strokeWidth={1.8} />}
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

        <input type="hidden" name="deviceCategory" value={deviceCategory ?? ""} />
        <input
          type="hidden"
          name="identifiers"
          value={JSON.stringify(identifiers.filter((i) => i.label.trim() && i.value.trim()))}
        />

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">What kind of item is this?</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => pickCategory(cat.key)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
                  deviceCategory === cat.key ? "bg-brand-soft text-brand-text" : "bg-background text-muted"
                }`}
                style={
                  deviceCategory === cat.key
                    ? { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }
                    : { boxShadow: "-1px -1px 3px var(--neu-light), 1px 1px 3px var(--neu-dark)" }
                }
              >
                {cat.label}
              </button>
            ))}
          </div>

          {deviceCategory && (
            <div className="flex flex-col gap-1.5">
              {identifiers.map((id, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={id.label}
                    onChange={(e) => updateIdentifier(i, { label: e.target.value })}
                    placeholder="e.g. IMEI"
                    className="w-1/3 rounded-lg border border-border px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                  />
                  <input
                    value={id.value}
                    onChange={(e) => updateIdentifier(i, { value: e.target.value })}
                    placeholder="Value"
                    className="flex-1 rounded-lg border border-border px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                  />
                  <button type="button" onClick={() => removeIdentifierRow(i)} className="text-xs font-medium text-danger">
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" onClick={addIdentifierRow} className="self-start text-xs font-medium text-brand">
                + Add another ID (e.g. second IMEI, engine no.)
              </button>
            </div>
          )}
        </div>

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
                  onChange={(e) => updateItem(i, { quantity: e.target.value === "" ? 0 : Number(e.target.value) })}
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
