"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { TrendingUp, Camera, X } from "lucide-react";
import { recordPaymentAction } from "@/lib/actions/customers";
import { useToast } from "@/app/components/Toast";
import { addGrowthLogAction, uploadPatientPhotoAction, deletePatientPhotoAction } from "@/lib/actions/clinic";
import { formatMoney, formatDateTime } from "@/lib/format";
import { EmptyState } from "@/app/components/EmptyState";
import { Popup } from "@/app/components/Popup";
import { DownloadStatementButton } from "./DownloadStatementButton";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { EditCustomerButton } from "./EditCustomerButton";
import { PaymentMethodPicker } from "@/app/components/PaymentMethodPicker";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

type BillItem = { name: string; quantity: number; unitPrice: number; lineTotal: number };
type Bill = {
  id: string;
  invoiceNumber: string;
  total: number;
  paidAmount: number;
  creditAmount: number;
  status: "active" | "voided";
  createdAt: string;
  items: BillItem[];
};
type Payment = { id: string; amount: number; note: string | null; createdAt: string };
type Return = { id: string; returnNumber: string; total: number; createdAt: string; invoiceNumber: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary-sm">
      {pending ? "Saving…" : "Record payment"}
    </button>
  );
}

export function LedgerClient({
  customer,
  shopName,
  balance,
  bills,
  payments,
  returns,
  lang,
  specialty,
  growthLogs,
  photos,
}: {
  customer: { id: string; name: string; phone: string; gstin: string | null; address: string | null; stateCode: string | null; loyaltyPoints: number };
  shopName: string;
  balance: number;
  bills: Bill[];
  payments: Payment[];
  returns: Return[];
  lang: Lang;
  specialty: string;
  growthLogs: { id: string; heightCm: number | null; weightKg: number | null; headCircumferenceCm: number | null; note: string | null; createdAt: string }[];
  photos: { id: string; photoUrl: string; label: string; note: string | null; createdAt: string }[];
}) {
  const { t } = useTranslation(lang);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null);

  const { showToast } = useToast();
  const [state, formAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await recordPaymentAction(prev, formData);
      if (!result?.error) {
        setShowPaymentForm(false);
        showToast("Payment recorded");
      }
      return result;
    },
    null,
  );

  const timeline = [
    ...bills.map((b) => ({ type: "bill" as const, at: b.createdAt, data: b })),
    ...payments.map((p) => ({ type: "payment" as const, at: p.createdAt, data: p })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const whatsappHref = buildWhatsAppReminderLink(customer, balance, t);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/customers" className="text-sm text-muted">
        ← Customers
      </Link>

      <div className="neu-card p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{customer.name}</h1>
            <p className="text-sm text-muted">{customer.phone}</p>
          </div>
          <EditCustomerButton customer={customer} />
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-xs text-muted">Outstanding balance</p>
            <p className={`text-2xl font-semibold ${balance > 0 ? "text-credit" : "text-foreground"}`}>
              {formatMoney(balance)}
            </p>
            {customer.loyaltyPoints > 0 && (
              <p className="mt-1 text-xs font-medium text-brand-text">🎁 {customer.loyaltyPoints} loyalty points</p>
            )}
          </div>
          {balance > 0 && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3.5 py-2 text-sm font-medium text-white"
            >
              <WhatsAppIcon />
              Remind
            </a>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => {
              const link = `${window.location.origin}/khata/${customer.id}`;
              const message = [
                `Hi ${customer.name}, here's your khata with ${shopName}.`,
                balance > 0 ? `Balance due: ${formatMoney(balance)}` : `Your account is fully settled.`,
                ``,
                `View it any time: ${link}`,
              ].join("\n");
              const digits = customer.phone.replace(/\D/g, "");
              window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, "_blank");
            }}
            className="flex-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground"
          >
            Share khata
          </button>
          <button
            onClick={() => {
              const link = `${window.location.origin}/warranty-card/${customer.id}`;
              const message = [
                `Hi ${customer.name}, here's your warranty card from ${shopName}.`,
                `It shows every item still under warranty — works even if you lose the paper bill.`,
                ``,
                link,
              ].join("\n");
              const digits = customer.phone.replace(/\D/g, "");
              window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, "_blank");
            }}
            className="flex-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground"
          >
            Share warranty
          </button>
        </div>
      </div>

      {specialty === "pediatric" && <GrowthChart patientId={customer.id} logs={growthLogs} />}
      {specialty === "dermatology" && <PatientPhotos patientId={customer.id} photos={photos} />}

      <div className="flex gap-2">
        <button
          onClick={() => setShowPaymentForm((v) => !v)}
          className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground"
        >
          {showPaymentForm ? "Cancel" : "+ Record a payment"}
        </button>
        <DownloadStatementButton customer={customer} shopName={shopName} balance={balance} bills={bills} payments={payments} />
      </div>
      <p className="text-xs text-muted">
        Tap any bill below to see exactly what was bought that day — a full itemized statement
        (downloadable above) keeps monthly settlement transparent for regular udhaar customers.
      </p>

      {showPaymentForm && (
        <Popup open={showPaymentForm} onClose={() => setShowPaymentForm(false)} title="Record a payment">
        <form
          action={formAction}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="customerId" value={customer.id} />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Amount received (₹)</span>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <PaymentMethodPicker />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Note (optional)</span>
            <input
              name="note"
              placeholder="e.g. Paid in cash"
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          {state?.error && <p className="text-sm text-credit">{state.error}</p>}
          <SubmitButton />
        </form>
        </Popup>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">History</h2>
        {timeline.length === 0 ? (
          <EmptyState text="Nothing here yet — their first bill or payment will show up in this space." />
        ) : (
          <ul className="flex flex-col gap-2">
            {timeline.map((entry) =>
              entry.type === "bill" ? (
                <li
                  key={entry.data.id}
                  className={`rounded-lg border shadow-sm ${
                    entry.data.status === "voided"
                      ? "border-border bg-background opacity-60"
                      : "border-border bg-surface"
                  }`}
                >
                  <button
                    onClick={() =>
                      setExpandedBillId((cur) => (cur === entry.data.id ? null : entry.data.id))
                    }
                    className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-medium text-foreground ${
                          entry.data.status === "voided" ? "line-through" : ""
                        }`}
                      >
                        Bill #{entry.data.invoiceNumber}
                      </p>
                      <p className="text-xs text-muted">{formatDateTime(entry.data.createdAt)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {entry.data.status === "voided" ? (
                        <p className="text-xs font-medium text-danger">Voided</p>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-foreground">
                            {formatMoney(entry.data.total)}
                          </p>
                          {entry.data.creditAmount > 0 && (
                            <p className="text-xs text-credit">
                              {formatMoney(entry.data.creditAmount)} on credit
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </button>
                  {expandedBillId === entry.data.id && (
                    <div className="border-t border-border px-3.5 py-2.5">
                      <ul className="flex flex-col gap-1">
                        {entry.data.items.map((item, i) => (
                          <li key={i} className="flex justify-between text-xs text-muted">
                            <span className="min-w-0 flex-1 truncate">
                              {item.name} × {item.quantity}
                            </span>
                            <span className="shrink-0 text-foreground">
                              {formatMoney(item.lineTotal)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <Link
                        href={`/print/bill/${entry.data.id}`}
                        className="mt-2 inline-block text-xs font-medium text-brand"
                      >
                        View full invoice →
                      </Link>
                    </div>
                  )}
                </li>
              ) : (
                <li
                  key={entry.data.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-brand-soft px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-brand-text">
                      Payment received
                    </p>
                    <p className="truncate text-xs text-muted">
                      {formatDateTime(entry.data.createdAt)}
                      {entry.data.note ? ` · ${entry.data.note}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-brand-text">
                    − {formatMoney(entry.data.amount)}
                  </p>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      {returns.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">Returns</p>
          <ul className="flex flex-col gap-2">
            {returns.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/returns/${r.id}`}
                  className="flex items-center justify-between neu-card px-3.5 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">↩️ #{r.returnNumber}</p>
                    <p className="text-xs text-muted">
                      Against #{r.invoiceNumber} · {formatDateTime(r.createdAt)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-danger">− {formatMoney(r.total)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function buildWhatsAppReminderLink(
  customer: { name: string; phone: string },
  balance: number,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  // wa.me only supports pre-filled TEXT, never file/image attachments —
  // this is a platform limitation, not a shortcut. See lib note in bills.ts.
  const digits = customer.phone.replace(/\D/g, "");
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  const message = t("wa.ledgerReminder", { name: customer.name, amount: formatMoney(balance) });
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.2-1.3c1.4.8 3.1 1.3 4.8 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3C4 14.8 3.6 13.4 3.6 12c0-4.6 3.8-8.4 8.4-8.4s8.4 3.8 8.4 8.4-3.8 8.4-8.4 8.4zm4.6-6.3c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8.9-.2.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.2.2-.4.1-.1 0-.3 0-.4C10.4 9.4 10 8.4 9.8 8c-.2-.4-.3-.3-.5-.3h-.4c-.1 0-.4 0-.6.3-.2.2-.8.8-.8 2s.9 2.3 1 2.4c.1.2 1.7 2.6 4.1 3.6.6.2 1 .4 1.4.5.6.2 1.1.2 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.4-.3z" />
    </svg>
  );
}

// ─── Pediatric growth chart — plain trend, no percentile overlay ──────────
function GrowthChart({
  patientId,
  logs,
}: {
  patientId: string;
  logs: { id: string; heightCm: number | null; weightKg: number | null; headCircumferenceCm: number | null; note: string | null; createdAt: string }[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [headCirc, setHeadCirc] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const maxWeight = Math.max(...logs.map((l) => l.weightKg ?? 0), 1);

  function save() {
    startTransition(async () => {
      const result = await addGrowthLogAction({
        patientId,
        heightCm: height ? Number(height) : null,
        weightKg: weight ? Number(weight) : null,
        headCircumferenceCm: headCirc ? Number(headCirc) : null,
        note,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setHeight("");
      setWeight("");
      setHeadCirc("");
      setNote("");
      setShowForm(false);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><TrendingUp size={14} /> Growth chart</p>
        <button onClick={() => setShowForm((v) => !v)} className="text-xs font-medium text-brand">
          + Add entry
        </button>
      </div>
      <p className="text-xs text-muted">A plain trend of measurements over time — no percentile comparison, you interpret it.</p>

      {showForm && (
        <Popup open={showForm} onClose={() => setShowForm(false)} title="Add growth entry">
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-brand bg-brand-soft p-3">
          <div className="grid grid-cols-3 gap-2">
            <input type="number" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="Height (cm)" className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-brand" />
            <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Weight (kg)" className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-brand" />
            <input type="number" step="0.1" value={headCirc} onChange={(e) => setHeadCirc(e.target.value)} placeholder="Head (cm)" className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-brand" />
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-brand" />
          {error && <p className="text-xs text-danger">{error}</p>}
          <button onClick={save} disabled={isPending} className="self-start rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
            {isPending ? "Saving…" : "Save entry"}
          </button>
        </div>
        </Popup>
      )}

      {logs.length === 0 ? (
        <p className="text-xs text-muted">No entries yet.</p>
      ) : (
        <>
          {logs.some((l) => l.weightKg) && (
            <div className="flex h-24 items-end gap-1.5 rounded-lg border border-border bg-background p-2">
              {logs
                .filter((l) => l.weightKg)
                .map((l) => (
                  <div key={l.id} className="flex flex-1 flex-col items-center justify-end gap-1">
                    <div className="w-full rounded-t bg-brand" style={{ height: `${Math.max(8, (l.weightKg! / maxWeight) * 100)}%` }} />
                    <span className="text-[8px] text-muted">{l.weightKg}</span>
                  </div>
                ))}
            </div>
          )}
          <ul className="flex flex-col gap-1">
            {logs
              .slice()
              .reverse()
              .slice(0, 5)
              .map((l) => (
                <li key={l.id} className="text-xs text-muted">
                  {new Date(l.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })} —
                  {l.heightCm ? ` ${l.heightCm}cm` : ""}
                  {l.weightKg ? ` ${l.weightKg}kg` : ""}
                  {l.headCircumferenceCm ? ` HC:${l.headCircumferenceCm}cm` : ""}
                  {l.note ? ` — ${l.note}` : ""}
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  );
}

// ─── Dermatology before/after photos ──────────────────────────────────────
function PatientPhotos({
  patientId,
  photos,
}: {
  patientId: string;
  photos: { id: string; photoUrl: string; label: string; note: string | null; createdAt: string }[];
}) {
  const router = useRouter();
  const [label, setLabel] = useState<"before" | "after" | "other">("before");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

  function handleUpload(file: File) {
    setError(null);
    const formData = new FormData();
    formData.append("image", file);
    startTransition(async () => {
      const result = await uploadPatientPhotoAction(patientId, label, note, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNote("");
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Camera size={14} /> Before / after photos</p>

      <div className="flex flex-wrap items-center gap-2">
        {(["before", "after", "other"] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLabel(l)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${label === l ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}
          >
            {l}
          </button>
        ))}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-brand" />
      </div>
      <label className="self-start rounded-lg border border-dashed border-brand bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand-text">
        {isPending ? "Uploading…" : "+ Upload photo"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={isPending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
        />
      </label>
      {error && <p className="text-xs text-danger">{error}</p>}

      {photos.length === 0 ? (
        <p className="text-xs text-muted">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className={`relative flex flex-col gap-1 ${deletingPhotoId === p.id ? "animate-delete" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- patient-uploaded photo */}
              <img src={p.photoUrl} alt={p.label} className="aspect-square w-full rounded-lg object-cover" />
              <span className="rounded-full bg-background px-1.5 py-0.5 text-center text-[9px] font-medium capitalize text-muted">{p.label}</span>
              <button
                onClick={() => {
                  setDeletingPhotoId(p.id);
                  startTransition(async () => {
                    await deletePatientPhotoAction(p.id, patientId);
                    router.refresh();
                  });
                }}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] text-white"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
