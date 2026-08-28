"use client";

import { useMemo, useState, useTransition } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { createPettyCashEntryAction, deletePettyCashEntryAction } from "@/lib/actions/petty-cash";
import { useToast } from "@/app/components/Toast";
import { formatMoney, formatDateTime } from "@/lib/format";
import { EmptyState } from "@/app/components/EmptyState";
import { Popup } from "@/app/components/Popup";
import { PageHeader } from "@/app/components/PageHeader";
import { Camera, X } from "lucide-react";
import { ScanBillModal } from "./ScanBillModal";

type Entry = { id: string; description: string; amount: number; category: string | null; expenseType: "business" | "owner"; createdAt: string };

const QUICK_CATEGORIES = ["Tea/Snacks", "Stationery", "Transport", "Cleaning", "Repairs", "Other"];
const PAYMENT_METHODS = ["cash", "upi", "card", "other"] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary-sm disabled:opacity-60">
      {pending ? "Saving…" : "+ Add"}
    </button>
  );
}

export function PettyCashClient({ entries }: { entries: Entry[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]>("cash");
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { showToast } = useToast();

  // Genuinely the top-level "Record Expense" context — Business or
  // Owner. Selecting one genuinely changes both what the entry form
  // saves AND which history/totals are shown below, exactly matching
  // "Record Expense → Business Expense / Owner Expense" — the two
  // are never mixed into one combined total.
  const [expenseType, setExpenseType] = useState<"business" | "owner">("business");

  const [state, formAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await createPettyCashEntryAction(prev, formData);
      if (!result?.error) {
        setShowForm(false);
        setCategory("");
        setDescription("");
        setAmount("");
        showToast(expenseType === "owner" ? "Owner expense recorded" : "Business expense recorded");
        router.refresh();
      }
      return result;
    },
    null,
  );

  const filteredEntries = useMemo(() => entries.filter((e) => e.expenseType === expenseType), [entries, expenseType]);

  const todayTotal = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return filteredEntries.filter((e) => new Date(e.createdAt) >= todayStart).reduce((s, e) => s + e.amount, 0);
  }, [filteredEntries]);
  const monthTotal = useMemo(() => filteredEntries.reduce((s, e) => s + e.amount, 0), [filteredEntries]);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Expense"
        action={
          <button onClick={() => setShowForm((v) => !v)} className="btn-primary-sm">
            + Expense
          </button>
        }
        // eslint-disable-next-line @next/next/no-img-element -- small branded SVG icon
        icon={<img src="/assets/ray-icons/cash.svg" alt="" className="h-9 w-9 md:h-11 md:w-11" />}
        bareIcon
      />

      {/* Top-level context switch — Business vs Owner, genuinely
          separate datasets, never merged. */}
      <div className="flex gap-2">
        {(["business", "owner"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setExpenseType(t)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold capitalize ${
              expenseType === t ? "bg-brand text-white" : "border border-border text-muted"
            }`}
          >
            {t} expense
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="neu-card p-3 text-center">
          <p className="text-xs text-muted">Today</p>
          <p className="mt-0.5 text-base font-semibold text-foreground neu-text">{formatMoney(todayTotal)}</p>
        </div>
        <div className="neu-card p-3 text-center">
          <p className="text-xs text-muted">This month</p>
          <p className="mt-0.5 text-base font-semibold text-foreground neu-text">{formatMoney(monthTotal)}</p>
        </div>
      </div>

      {showForm && (
        <Popup open={showForm} onClose={() => setShowForm(false)} title={`Add ${expenseType} expense`}>
        <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
          <input type="hidden" name="expenseType" value={expenseType} />
          <button
            type="button"
            onClick={() => setShowScan(true)}
            className="flex items-center justify-center gap-2 rounded-lg border border-brand bg-surface px-3 py-2 text-sm font-medium text-brand-text"
          >
            <Camera size={15} /> Scan bill instead
          </button>
          <input
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was it for? (e.g. Tea for staff)"
            required
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <input
            name="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Amount (₹)"
            required
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <input type="hidden" name="category" value={category} />
          <div className="flex flex-wrap gap-1.5">
            {QUICK_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                  category === c ? "border-brand bg-surface text-brand-text" : "border-transparent bg-surface/60 text-muted"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <input type="hidden" name="paymentMethod" value={paymentMethod} />
          <div>
            <p className="mb-1 text-xs text-muted">Payment method</p>
            <div className="grid grid-cols-4 gap-1.5">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`rounded-lg py-1.5 text-xs font-medium capitalize ${
                    paymentMethod === m ? "bg-brand text-white" : "bg-surface text-muted"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          {state?.error && <p className="text-sm text-danger">{state.error}</p>}
          <div className="flex gap-2">
            <SubmitButton />
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
              Cancel
            </button>
          </div>
        </form>
        </Popup>
      )}

      {filteredEntries.length === 0 ? (
        <EmptyState text={`No ${expenseType} expenses logged yet — they'll appear here once you record one.`} />
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
          {filteredEntries.map((e) => (
            <li
              key={e.id}
              className={`neu-card flex items-center justify-between px-3.5 py-2.5 ${deletingId === e.id ? "animate-delete" : ""}`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{e.description}</p>
                <p className="text-xs text-muted">
                  {e.category ? `${e.category} · ` : ""}
                  {formatDateTime(e.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{formatMoney(e.amount)}</p>
                <button
                  onClick={() => {
                    if (!confirm("Delete this entry?")) return;
                    setDeletingId(e.id);
                    startTransition(async () => {
                      await deletePettyCashEntryAction(e.id);
                      setDeletingId(null);
                      router.refresh();
                    });
                  }}
                  disabled={isPending && deletingId === e.id}
                  className="text-xs font-medium text-danger disabled:opacity-50"
                >
                  <X size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showScan && (
        <ScanBillModal
          onConfirm={(fields) => {
            setDescription(fields.description);
            setAmount(fields.amount);
            setShowScan(false);
          }}
          onCancel={() => setShowScan(false)}
        />
      )}
    </div>
  );
}
