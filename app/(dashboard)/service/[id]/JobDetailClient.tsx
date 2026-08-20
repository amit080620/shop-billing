"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateJobStatusAction, assignTechnicianAction, deliverJobAction, addPartToJobAction, removePartFromJobAction } from "@/lib/actions/service";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { Check } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { buildWhatsAppLink as buildWaLink } from "@/lib/whatsapp";
import type { Lang } from "@/lib/i18n/dictionary";

type Job = {
  id: string;
  jobNumber: string;
  customerName: string;
  customerPhone: string;
  itemDescription: string;
  deviceCategory: string | null;
  identifiers: { label: string; value: string }[];
  issueDescription: string | null;
  status: "received" | "in_progress" | "ready" | "delivered" | "cancelled";
  technicianName: string | null;
  estimatedCost: number | null;
  finalCost: number | null;
  advancePaid: number;
  expectedDate: string | null;
  createdAt: string;
  readyAt: string | null;
  deliveredAt: string | null;
  billId: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  received: "Received",
  in_progress: "In progress",
  ready: "Ready for pickup",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function whatsappReadyLink(job: Job, t: (key: string, values?: Record<string, string | number>) => string) {
  const message = t("wa.jobReady", { name: job.customerName, item: job.itemDescription, jobNumber: job.jobNumber });
  return buildWaLink(job.customerPhone, message);
}

type JobItem = { id: string; name: string; quantity: number; notes: string | null };
type JobPart = { id: string; productId: string; name: string; quantity: number; unitPrice: number; gstPercent: number };
type Product = { id: string; name: string; price: number; gstPercent: number };

export function JobDetailClient({
  job,
  items,
  parts,
  products,
  lang,
}: {
  job: Job;
  items: JobItem[];
  parts: JobPart[];
  products: Product[];
  lang: Lang;
}) {
  const { t } = useTranslation(lang);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [technician, setTechnician] = useState(job.technicianName ?? "");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [partQuantity, setPartQuantity] = useState(1);
  const [isAddingPart, startAddPart] = useTransition();
  const [showDeliver, setShowDeliver] = useState(false);

  function moveStatus(status: "received" | "in_progress" | "ready" | "cancelled") {
    startTransition(async () => {
      const result = await updateJobStatusAction(job.id, status);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function saveTechnician() {
    startTransition(async () => {
      await assignTechnicianAction(job.id, technician);
      router.refresh();
    });
  }

  function addPart() {
    if (!selectedProduct) return;
    startAddPart(async () => {
      const result = await addPartToJobAction(job.id, selectedProduct.id, partQuantity);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setSelectedProduct(null);
      setPartQuantity(1);
      router.refresh();
    });
  }

  function removePart(partId: string) {
    startAddPart(async () => {
      await removePartFromJobAction(partId, job.id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <Link href="/service" className="text-sm text-muted">
        ← Jobs
      </Link>

      <div>
        <h1 className="text-lg font-semibold text-foreground">{job.itemDescription}</h1>
        <p className="text-sm text-muted">{job.customerName} · {job.customerPhone} · #{job.jobNumber}</p>
        <span className="mt-1 inline-block rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand-text">
          {STATUS_LABELS[job.status]}
        </span>
      </div>

      {job.identifiers.length > 0 && (
        <div className="neu-card flex flex-col gap-1 px-3.5 py-2.5">
          {job.identifiers.map((id, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-muted">{id.label}</span>
              <span className="font-mono font-medium text-foreground">{id.value}</span>
            </div>
          ))}
        </div>
      )}

      {items.length > 1 && (
        <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5">
          <p className="text-xs text-muted">Items ({items.length})</p>
          <ul className="mt-1 flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.id} className="text-sm text-foreground">
                {item.name} {item.quantity > 1 ? `× ${item.quantity}` : ""}
                {item.notes && <span className="text-xs text-muted"> — {item.notes}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(parts.length > 0 || job.status !== "delivered") && (
        <div className="neu-card flex flex-col gap-2.5 px-3.5 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Parts used from stock</p>
            {parts.length > 0 && (
              <p className="text-xs text-muted">
                {formatMoney(parts.reduce((s, p) => s + p.quantity * p.unitPrice, 0))}
              </p>
            )}
          </div>

          {parts.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {parts.map((part) => (
                <li key={part.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {part.name} {part.quantity > 1 ? `× ${part.quantity}` : ""}
                  </span>
                  <span className="shrink-0 text-muted">{formatMoney(part.quantity * part.unitPrice)}</span>
                  {job.status !== "delivered" && (
                    <button onClick={() => removePart(part.id)} disabled={isAddingPart} className="shrink-0 text-xs text-danger">
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {job.status !== "delivered" && (
            <div className="flex gap-2">
              <div className="flex-1">
                <SearchableSelect
                  lang={lang}
                  items={products}
                  getKey={(p: Product) => p.id}
                  getLabel={(p: Product) => p.name}
                  getSubLabel={(p: Product) => formatMoney(p.price)}
                  onSelect={(p: Product) => setSelectedProduct(p)}
                  placeholder="Search a part from your stock…"
                />
              </div>
              <input
                type="number"
                min={1}
                step="1"
                value={partQuantity}
                onChange={(e) => setPartQuantity(Math.max(1, Number(e.target.value) || 1))}
                className="w-14 rounded-lg border border-border px-2 py-2 text-sm outline-none focus:border-brand"
              />
              <button
                onClick={addPart}
                disabled={!selectedProduct || isAddingPart}
                className="btn-primary-sm shrink-0 disabled:opacity-60"
              >
                Add
              </button>
            </div>
          )}
          <p className="text-[11px] text-muted">
            Stock is deducted when the job is delivered and billed — not the moment a part is added here.
          </p>
        </div>
      )}

      {job.issueDescription && (
        <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5">
          <p className="text-xs text-muted">Work needed</p>
          <p className="text-sm text-foreground">{job.issueDescription}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {job.estimatedCost != null && (
          <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5">
            <p className="text-xs text-muted">Estimated</p>
            <p className="text-sm font-medium text-foreground">{formatMoney(job.estimatedCost)}</p>
          </div>
        )}
        {job.advancePaid > 0 && (
          <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5">
            <p className="text-xs text-muted">Advance received</p>
            <p className="text-sm font-medium text-foreground">{formatMoney(job.advancePaid)}</p>
          </div>
        )}
        {job.expectedDate && (
          <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5">
            <p className="text-xs text-muted">Expected by</p>
            <p className="text-sm font-medium text-foreground">
              {new Date(job.expectedDate).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}
            </p>
          </div>
        )}
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Technician / staff working on it</span>
        <div className="flex gap-2">
          <input
            value={technician}
            onChange={(e) => setTechnician(e.target.value)}
            placeholder="Optional"
            className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button onClick={saveTechnician} disabled={isPending} className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground disabled:opacity-60">
            Save
          </button>
        </div>
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      {job.status !== "delivered" && job.status !== "cancelled" && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
          <p className="text-sm font-semibold text-brand-text">Update status</p>
          <div className="flex flex-wrap gap-2">
            {job.status !== "received" && (
              <button onClick={() => moveStatus("received")} disabled={isPending} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-60">
                Mark Received
              </button>
            )}
            {job.status !== "in_progress" && (
              <button onClick={() => moveStatus("in_progress")} disabled={isPending} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-60">
                Mark In Progress
              </button>
            )}
            {job.status !== "ready" && (
              <button onClick={() => moveStatus("ready")} disabled={isPending} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-60">
                Mark Ready
              </button>
            )}
          </div>
          {job.status === "ready" && (
            <a
              href={whatsappReadyLink(job, t)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 text-center text-xs font-medium text-brand-text underline"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- small branded SVG icon */}
              <img src="/assets/ray-icons/message.svg" alt="" className="h-3.5 w-3.5" /> Notify customer on WhatsApp
            </a>
          )}
          <button
            onClick={() => {
              const link = `${window.location.origin}/job-status/${job.id}`;
              const msg = [
                `Hi ${job.customerName}, we've received your ${job.itemDescription} (Job #${job.jobNumber}).`,
                ``,
                `Check its status any time here — no need to call:`,
                link,
              ].join("\n");
              window.open(buildWaLink(job.customerPhone, msg), "_blank");
            }}
            className="w-full rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground"
          >
            Send tracking link to customer
          </button>
          <div className="flex gap-2 border-t border-brand/30 pt-3">
            <button onClick={() => setShowDeliver(true)} className="btn-primary-sm flex flex-1 items-center justify-center gap-1 text-center">
              <Check size={13} /> Deliver & bill
            </button>
            <button
              onClick={() => {
                if (!confirm("Cancel this job?")) return;
                moveStatus("cancelled");
              }}
              disabled={isPending}
              className="rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger disabled:opacity-60"
            >
              Cancel job
            </button>
          </div>
        </div>
      )}

      {job.status === "delivered" && job.billId && (
        <Link href={`/print/bill/${job.billId}`} className="rounded-lg border border-brand bg-brand-soft px-3.5 py-2.5 text-center text-sm font-medium text-brand-text">
          View bill →
        </Link>
      )}

      {showDeliver && (
        <DeliverModal
          job={job}
          partsTotal={parts.reduce((s, p) => s + p.quantity * p.unitPrice, 0)}
          onClose={() => setShowDeliver(false)}
          onDone={(billId) => router.push(`/print/bill/${billId}`)}
        />
      )}
    </div>
  );
}

function DeliverModal({
  job,
  partsTotal,
  onClose,
  onDone,
}: {
  job: Job;
  partsTotal: number;
  onClose: () => void;
  onDone: (billId: string) => void;
}) {
  const [finalCost, setFinalCost] = useState<number | "">(job.estimatedCost ?? "");
  const [gstPercent, setGstPercent] = useState<number | "">(0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "upi" | "online" | "other">("cash");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function round2(n: number) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  const total = typeof finalCost === "number" ? finalCost * (1 + (typeof gstPercent === "number" ? gstPercent : 0) / 100) : 0;
  const balanceDue = Math.max(0, round2(total) - job.advancePaid);

  function submit() {
    if (typeof finalCost !== "number" || finalCost <= 0) {
      setError("Enter the final charge");
      return;
    }
    startTransition(async () => {
      const result = await deliverJobAction(job.id, finalCost, typeof gstPercent === "number" ? gstPercent : 0, balanceDue, paymentMethod);
      if (result.error || !result.billId) {
        setError(result.error ?? "Could not deliver job");
        return;
      }
      onDone(result.billId);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5">
        <p className="text-sm font-semibold text-foreground">Deliver job & generate bill</p>
        <p className="mt-1 text-xs text-muted">This creates the actual invoice for the customer.</p>

        <label className="mt-3 flex flex-col gap-1 text-xs text-muted">
          {partsTotal > 0 ? "Labour / service charge (₹)" : "Final charge (₹)"}
          <input
            type="number"
            min="0"
            step="0.01"
            value={finalCost}
            onChange={(e) => setFinalCost(e.target.value === "" ? "" : Number(e.target.value))}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
          {partsTotal > 0 && (
            <span className="text-[11px] text-brand-text">
              Parts worth {formatMoney(partsTotal)} are billed separately on top of this — don&apos;t include them here.
            </span>
          )}
        </label>
        <label className="mt-3 flex flex-col gap-1 text-xs text-muted">
          GST % (0 if not applicable)
          <input
            type="number"
            min="0"
            max="28"
            step="0.01"
            value={gstPercent}
            onChange={(e) => setGstPercent(e.target.value === "" ? "" : Number(e.target.value))}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        {job.advancePaid > 0 && (
          <p className="mt-3 text-xs text-muted">Advance already received: {formatMoney(job.advancePaid)}</p>
        )}
        <p className="mt-1 text-sm font-semibold text-foreground">Balance due now: {formatMoney(balanceDue)}</p>

        <label className="mt-3 flex flex-col gap-1 text-xs text-muted">
          Payment method for the balance
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          >
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="upi">UPI</option>
            <option value="online">Online</option>
            <option value="other">Other</option>
          </select>
        </label>

        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={submit} disabled={isPending} className="btn-primary flex-1 text-center disabled:opacity-60">
            {isPending ? "Generating…" : "Confirm & generate bill"}
          </button>
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
