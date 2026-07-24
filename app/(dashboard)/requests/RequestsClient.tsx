"use client";

import { useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  createItemRequestAction,
  markRequestAvailableAction,
  markRequestFulfilledAction,
  cancelRequestAction,
} from "@/lib/actions/item-requests";
import { formatMoney, formatDateTime } from "@/lib/format";
import { EmptyState } from "@/app/components/EmptyState";
import { PageIcon } from "@/app/components/PageIcon";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { ContactPickerButton } from "@/app/components/ContactPickerButton";

type Customer = { id: string; name: string; phone: string };
type Request = {
  id: string;
  customerName: string;
  customerPhone: string;
  itemDescription: string;
  advanceAmount: number;
  expectedDate: string | null;
  status: "pending" | "available" | "fulfilled" | "cancelled";
  notes: string | null;
  createdAt: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary-sm"
    >
      {pending ? "Saving…" : "Save request"}
    </button>
  );
}

export function RequestsClient({
  shopName,
  customers,
  requests,
}: {
  shopName: string;
  customers: Customer[];
  requests: Request[];
}) {
  const [showForm, setShowForm] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isPending, startTransition] = useTransition();

  const [state, formAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await createItemRequestAction(prev, formData);
      if (!result?.error) {
        setShowForm(false);
        setSelectedCustomer(null);
      }
      return result;
    },
    null,
  );

  const pending = requests.filter((r) => r.status === "pending");
  const available = requests.filter((r) => r.status === "available");
  const closed = requests.filter((r) => r.status === "fulfilled" || r.status === "cancelled");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PageIcon>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
          </PageIcon>
          <h1 className="text-lg font-semibold text-foreground">Item requests</h1>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary-sm"
        >
          + New request
        </button>
      </div>
      <p className="text-sm text-muted">
        Customer asked for something you didn&apos;t have? Log it here — when it arrives, notify
        them on WhatsApp with one tap.
      </p>

      {showForm && (
        <form
          action={formAction}
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface shadow-sm p-4"
        >
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Customer</p>
            {selectedCustomer ? (
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{selectedCustomer.name}</p>
                  <p className="text-xs text-muted">{selectedCustomer.phone}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  className="shrink-0 text-xs font-medium text-brand"
                >
                  Change
                </button>
              </div>
            ) : customers.length > 0 ? (
              <SearchableSelect
                items={customers}
                getKey={(c) => c.id}
                getLabel={(c) => c.name}
                getSubLabel={(c) => c.phone}
                onSelect={setSelectedCustomer}
                placeholder="Search existing customer (optional)"
              />
            ) : null}
          </div>

          <input type="hidden" name="customerId" value={selectedCustomer?.id ?? ""} />

          {!selectedCustomer && (
            <>
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
                  name="customerName"
                  required
                  className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-foreground">Phone</span>
                <input
                  ref={phoneRef}
                  name="customerPhone"
                  type="tel"
                  required
                  className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </label>
            </>
          )}
          {selectedCustomer && (
            <>
              <input type="hidden" name="customerName" value={selectedCustomer.name} />
              <input type="hidden" name="customerPhone" value={selectedCustomer.phone} />
            </>
          )}

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Item they asked for</span>
            <input
              name="itemDescription"
              required
              placeholder="e.g. 25kg Ashirvad atta"
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">Advance taken (₹)</span>
              <input
                name="advanceAmount"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">Expected by (optional)</span>
              <input
                name="expectedDate"
                type="date"
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Notes (optional)</span>
            <input
              name="notes"
              placeholder="e.g. Wants the red packet specifically"
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>

          {state?.error && <p className="text-sm text-credit">{state.error}</p>}
          <SubmitButton />
        </form>
      )}

      {available.length > 0 && (
        <Section title="Ready — notify customer" tone="brand">
          {available.map((r) => (
            <RequestCard key={r.id} r={r} shopName={shopName}>
              <button
                disabled={isPending}
                onClick={() => startTransition(() => markRequestFulfilledAction(r.id))}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-50"
              >
                Mark collected
              </button>
            </RequestCard>
          ))}
        </Section>
      )}

      <Section title={`Pending (${pending.length})`}>
        {pending.length === 0 ? (
          <EmptyState text="No pending requests." />
        ) : (
          pending.map((r) => (
            <RequestCard key={r.id} r={r} shopName={shopName}>
              <div className="flex gap-2">
                <button
                  disabled={isPending}
                  onClick={() => startTransition(() => markRequestAvailableAction(r.id))}
                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  Mark available
                </button>
                <button
                  disabled={isPending}
                  onClick={() => startTransition(() => cancelRequestAction(r.id))}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-danger disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </RequestCard>
          ))
        )}
      </Section>

      {closed.length > 0 && (
        <Section title="History">
          {closed.map((r) => (
            <RequestCard key={r.id} r={r} shopName={shopName} muted />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  tone = "default",
  children,
}: {
  title: string;
  tone?: "default" | "brand";
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2
        className={`text-sm font-semibold ${tone === "brand" ? "text-brand-dark" : "text-foreground"}`}
      >
        {title}
      </h2>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  );
}

function RequestCard({
  r,
  shopName,
  muted,
  children,
}: {
  r: Request;
  shopName: string;
  muted?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li
      className={`flex flex-col gap-2 rounded-lg border border-border p-3.5 ${
        muted ? "bg-background opacity-70" : "bg-surface"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{r.itemDescription}</p>
          <p className="text-xs text-muted">
            {r.customerName} · {r.customerPhone}
          </p>
          <p className="text-xs text-muted">
            Requested {formatDateTime(r.createdAt)}
            {r.expectedDate ? ` · Expected ${r.expectedDate}` : ""}
          </p>
          {r.advanceAmount > 0 && (
            <p className="text-xs text-brand">Advance: {formatMoney(r.advanceAmount)}</p>
          )}
          {r.notes && <p className="text-xs text-muted">{r.notes}</p>}
        </div>
        <StatusBadge status={r.status} />
      </div>
      <div className="flex items-center justify-between gap-2">
        {r.status === "available" && (
          <a
            href={buildWhatsAppLink(r, shopName)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-medium text-white"
          >
            <WhatsAppIcon />
            Notify on WhatsApp
          </a>
        )}
        {children}
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: Request["status"] }) {
  const styles: Record<Request["status"], string> = {
    pending: "bg-credit-soft text-credit",
    available: "bg-brand-soft text-brand-dark",
    fulfilled: "bg-background text-muted",
    cancelled: "bg-background text-muted line-through",
  };
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}

function buildWhatsAppLink(r: Request, shopName: string) {
  const digits = r.customerPhone.replace(/\D/g, "");
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  const advanceLine = r.advanceAmount > 0 ? ` Your advance of ${formatMoney(r.advanceAmount)} is on file.` : "";
  const message =
    `Hi ${r.customerName}, good news from ${shopName} — the item you asked for ` +
    `(${r.itemDescription}) is now available.${advanceLine} Please visit to collect it. Thank you!`;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}

function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.2-1.3c1.4.8 3.1 1.3 4.8 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3C4 14.8 3.6 13.4 3.6 12c0-4.6 3.8-8.4 8.4-8.4s8.4 3.8 8.4 8.4-3.8 8.4-8.4 8.4zm4.6-6.3c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8.9-.2.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.2.2-.4.1-.1 0-.3 0-.4C10.4 9.4 10 8.4 9.8 8c-.2-.4-.3-.3-.5-.3h-.4c-.1 0-.4 0-.6.3-.2.2-.8.8-.8 2s.9 2.3 1 2.4c.1.2 1.7 2.6 4.1 3.6.6.2 1 .4 1.4.5.6.2 1.1.2 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.4-.3z" />
    </svg>
  );
}
