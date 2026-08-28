"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { markTreatmentItemDoneAction, convertTreatmentPlanToBillAction } from "@/lib/actions/treatmentPlans";
import { PageHeader } from "@/app/components/PageHeader";
import { useToast } from "@/app/components/Toast";
import { ClipboardList, Printer, CheckCircle2, Circle, Receipt } from "lucide-react";

type Item = { id: string; toothNumber: string | null; procedureName: string; description: string | null; estimatedCost: number; status: string };
type Plan = { id: string; patientId: string | null; patientName: string; patientPhone: string | null; doctorName: string | null; notes: string | null; status: string; billId: string | null; createdAt: string };

export function TreatmentPlanDetailClient({ plan, items: initialItems }: { plan: Plan; items: Item[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState(initialItems);
  const [isPending, startTransition] = useTransition();
  const [showBillConfirm, setShowBillConfirm] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "upi" | "online" | "other">("cash");

  const total = items.reduce((s, it) => s + it.estimatedCost, 0);
  const completedCount = items.filter((it) => it.status === "completed" || it.status === "billed").length;
  const alreadyBilled = Boolean(plan.billId);

  function toggleDone(item: Item) {
    const done = item.status !== "completed";
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: done ? "completed" : "planned" } : it)));
    startTransition(async () => {
      await markTreatmentItemDoneAction(item.id, done);
    });
  }

  function convertToBill() {
    startTransition(async () => {
      const result = await convertTreatmentPlanToBillAction(plan.id, paymentMethod);
      if (result.error) {
        showToast(result.error);
        return;
      }
      showToast("Bill created");
      router.push(`/print/bill/${result.billId}`);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title={plan.patientName} icon={<ClipboardList size={18} strokeWidth={1.8} />} />
      <Link href="/clinic/treatment-plans" className="text-sm text-muted">
        ← Treatment plans
      </Link>

      <div className="neu-card flex flex-col gap-1 p-3.5">
        {plan.doctorName && <p className="text-sm text-muted">Dr. {plan.doctorName}</p>}
        {plan.patientPhone && <p className="text-sm text-muted">{plan.patientPhone}</p>}
        <p className="mt-1 text-xs text-muted">
          {completedCount} of {items.length} treatments completed
        </p>
      </div>

      <Link
        href={`/print/treatment-plan/${plan.id}`}
        target="_blank"
        className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground"
      >
        <Printer size={16} /> Print / share quotation
      </Link>

      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => !alreadyBilled && toggleDone(it)}
            disabled={alreadyBilled}
            className="neu-card flex items-center gap-3 p-3 text-left disabled:opacity-70"
          >
            {it.status === "completed" || it.status === "billed" ? (
              <CheckCircle2 size={20} className="shrink-0 text-emerald-600" />
            ) : (
              <Circle size={20} className="shrink-0 text-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-medium ${it.status !== "planned" ? "text-muted line-through" : "text-foreground"}`}>
                {it.procedureName}
                {it.toothNumber ? ` — Tooth ${it.toothNumber}` : ""}
              </p>
              {it.description && <p className="truncate text-xs text-muted">{it.description}</p>}
            </div>
            <span className="shrink-0 text-sm font-semibold text-foreground">₹{it.estimatedCost.toLocaleString("en-IN")}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-2.5">
        <span className="text-sm font-medium text-foreground">Total</span>
        <span className="text-base font-bold text-foreground">₹{total.toLocaleString("en-IN")}</span>
      </div>

      {alreadyBilled ? (
        <Link
          href={`/print/bill/${plan.billId}`}
          className="flex items-center justify-center gap-2 rounded-xl bg-brand-soft px-4 py-3 text-sm font-medium text-brand-text"
        >
          <Receipt size={16} /> View the bill for this plan
        </Link>
      ) : showBillConfirm ? (
        <div className="neu-card flex flex-col gap-3 p-3.5">
          <p className="text-sm font-medium text-foreground">Payment method</p>
          <div className="grid grid-cols-4 gap-1.5">
            {(["cash", "upi", "card", "other"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={`rounded-lg py-2 text-xs font-medium capitalize ${paymentMethod === m ? "bg-brand text-white" : "bg-background text-muted"}`}
              >
                {m}
              </button>
            ))}
          </div>
          <button onClick={convertToBill} disabled={isPending} className="btn-primary w-full text-center disabled:opacity-60">
            {isPending ? "Creating bill…" : `Confirm — bill ₹${total.toLocaleString("en-IN")}`}
          </button>
        </div>
      ) : (
        <button onClick={() => setShowBillConfirm(true)} className="btn-primary w-full text-center">
          Convert to bill
        </button>
      )}
    </div>
  );
}
