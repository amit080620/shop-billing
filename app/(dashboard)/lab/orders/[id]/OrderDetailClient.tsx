"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateLabOrderStatusAction, saveTestResultAction, billLabOrderAction } from "@/lib/actions/lab";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { FlaskConical } from "lucide-react";

type Order = {
  id: string;
  orderNumber: string;
  patientName: string;
  patientPhone: string;
  patientAge: string | null;
  patientGender: string | null;
  referringDoctorName: string | null;
  collectionType: string;
  homeAddress: string | null;
  collectionSlot: string | null;
  status: string;
  billId: string | null;
  phlebotomistName: string | null;
};
type Item = { id: string; testName: string; referenceRange: string | null; unit: string | null; resultValue: string | null; resultFlag: string | null; price: number };

const STATUS_FLOW = ["booked", "sample_collected", "received_at_lab", "processing", "report_ready", "delivered"] as const;
const STATUS_LABELS: Record<string, string> = {
  booked: "Booked",
  sample_collected: "Sample collected",
  received_at_lab: "Received at lab",
  processing: "Processing",
  report_ready: "Report ready",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
const FLAG_STYLE: Record<string, string> = {
  high: "text-danger font-semibold",
  low: "text-credit font-semibold",
  normal: "text-green-700",
};

export function OrderDetailClient({ order, items }: { order: Order; items: Item[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showBillForm, setShowBillForm] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "upi" | "online" | "other">("cash");
  const [paidAmount, setPaidAmount] = useState<number | "">("");
  const [results, setResults] = useState<Record<string, string>>(Object.fromEntries(items.map((i) => [i.id, i.resultValue ?? ""])));

  const total = items.reduce((s, i) => s + i.price, 0);
  const currentIndex = STATUS_FLOW.indexOf(order.status as (typeof STATUS_FLOW)[number]);

  function advanceStatus() {
    const next = STATUS_FLOW[currentIndex + 1];
    if (!next) return;
    startTransition(async () => {
      const result = await updateLabOrderStatusAction(order.id, next);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  function saveResult(itemId: string) {
    startTransition(async () => {
      const result = await saveTestResultAction(itemId, results[itemId] ?? "");
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  function generateBill() {
    startTransition(async () => {
      const result = await billLabOrderAction(order.id, paymentMethod, typeof paidAmount === "number" ? paidAmount : total);
      if (result.error || !result.billId) {
        setError(result.error ?? "Could not generate bill");
        return;
      }
      router.push(`/print/bill/${result.billId}`);
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        title={order.patientName}
        subtitle={`#${order.orderNumber} · ${order.patientPhone}`}
        icon={<FlaskConical size={18} strokeWidth={1.8} />}
      />
      <Link href="/lab/orders" className="text-sm text-muted">
        ← Orders
      </Link>

      <Link
        href={`/print/lab-report/${order.id}`}
        target="_blank"
        className="self-start rounded-lg border border-brand bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand-dark"
      >
        🖨️ View / print report
      </Link>

      <div className="rounded-xl border border-border bg-surface p-3.5 shadow-sm text-sm">
        <p className="text-muted">
          {order.patientAge ? `${order.patientAge}y · ` : ""}
          {order.patientGender ?? ""}
          {order.referringDoctorName ? ` · Ref by Dr. ${order.referringDoctorName}` : ""}
        </p>
        <p className="text-muted">
          {order.collectionType === "home_collection" ? `🏠 Home collection${order.homeAddress ? ` — ${order.homeAddress}` : ""}` : "🚶 Walk-in"}
          {order.collectionSlot ? ` · ${order.collectionSlot}` : ""}
        </p>
        {order.phlebotomistName && <p className="text-muted">Assigned: {order.phlebotomistName}</p>}
      </div>

      {order.status !== "cancelled" && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3.5 shadow-sm">
          <p className="text-sm font-medium text-foreground">Status: {STATUS_LABELS[order.status]}</p>
          {currentIndex >= 0 && currentIndex < STATUS_FLOW.length - 1 && (
            <button onClick={advanceStatus} disabled={isPending} className="btn-primary-sm self-start disabled:opacity-60">
              {isPending ? "Updating…" : `Mark as: ${STATUS_LABELS[STATUS_FLOW[currentIndex + 1]]} →`}
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Tests & results</p>
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-border bg-surface p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">{item.testName}</p>
                <p className="text-xs text-muted">{formatMoney(item.price)}</p>
              </div>
              {item.referenceRange && (
                <p className="text-xs text-muted">
                  Reference: {item.referenceRange} {item.unit ?? ""}
                </p>
              )}
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  value={results[item.id] ?? ""}
                  onChange={(e) => setResults((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  placeholder="Result"
                  className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-brand"
                />
                <button onClick={() => saveResult(item.id)} disabled={isPending} className="rounded-lg border border-brand px-2.5 py-1.5 text-xs font-medium text-brand-dark disabled:opacity-60">
                  Save
                </button>
              </div>
              {item.resultFlag && (
                <p className={`mt-1 text-xs ${FLAG_STYLE[item.resultFlag] ?? "text-muted"}`}>
                  {item.resultFlag === "high" ? "⬆ High" : item.resultFlag === "low" ? "⬇ Low" : "✓ Normal"} (compared to stated reference range only)
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex justify-between rounded-lg bg-brand-soft px-3.5 py-2.5 text-sm">
        <span className="text-brand-dark">Total</span>
        <span className="font-semibold text-brand-dark">{formatMoney(total)}</span>
      </div>

      {order.billId ? (
        <Link href={`/print/bill/${order.billId}`} className="btn-primary w-full text-center">
          🖨️ View invoice
        </Link>
      ) : order.status === "report_ready" || order.status === "delivered" ? (
        <>
          {!showBillForm ? (
            <button onClick={() => setShowBillForm(true)} className="btn-primary w-full text-center">
              Generate invoice
            </button>
          ) : (
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3.5 shadow-sm">
              <div className="grid grid-cols-2 gap-2">
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)} className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand">
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="upi">UPI</option>
                  <option value="online">Online</option>
                  <option value="other">Other</option>
                </select>
                <input
                  type="number"
                  min={0}
                  max={total}
                  step="0.01"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Amount paid"
                  className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>
              <button onClick={generateBill} disabled={isPending} className="btn-primary-sm disabled:opacity-60">
                {isPending ? "Generating…" : "Confirm & generate invoice"}
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="text-center text-xs text-muted">Mark the report as ready before generating the invoice.</p>
      )}
    </div>
  );
}
