"use client";

import { Plus, X } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";
import { formatMoney, paymentMethodLabel } from "@/lib/format";
import { CashChange } from "./CashChange";
import type { PaymentMode } from "@/lib/billPaymentSplit";

export type SplitRow = { method: PaymentMode; amount: number | ""; reference: string };

const MODES: PaymentMode[] = ["cash", "upi", "card", "online", "other"];
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** What the rows add up to (blank rows count as 0). */
export const splitSum = (rows: SplitRow[]) => round2(rows.reduce((s, r) => s + (typeof r.amount === "number" && r.amount > 0 ? r.amount : 0), 0));

/** The rows to send: only those above 0. */
export const splitToSend = (rows: SplitRow[]) =>
  rows.filter((r) => typeof r.amount === "number" && r.amount > 0).map((r) => ({ method: r.method, amount: round2(r.amount as number), ...(r.reference.trim() ? { reference: r.reference.trim() } : {}) }));

/** Why a split can't be saved yet, or null: more than the bill, or udhaar left on a walk-in bill. */
export function splitProblem(rows: SplitRow[], payable: number, canUdhaar: boolean): string | null {
  const paid = splitSum(rows);
  if (paid > payable + 0.005) return `Payments are ${formatMoney(round2(paid - payable))} more than the bill.`;
  if (payable - paid > 0.005 && !canUdhaar) return `${formatMoney(round2(payable - paid))} is unpaid — add a payment for it, or pick the customer to put it on udhaar.`;
  return null;
}

/** A bill paid more than one way: a row per payment (mode, amount, reference), what they add up to,
 * and — said plainly — what is left as udhaar on the customer's khata. Cash change is for the cash
 * row only. `payable` is what is due in money (the bill less old gold, a scheme or prepaid balance). */
export function SplitPayments({ rows, onChange, payable, canUdhaar, onSingle }: { rows: SplitRow[]; onChange: (rows: SplitRow[]) => void; payable: number; canUdhaar: boolean; onSingle: () => void }) {
  const { t } = useT();
  const paid = splitSum(rows);
  const left = round2(payable - paid);
  const problem = splitProblem(rows, payable, canUdhaar);
  const set = (i: number, patch: Partial<SplitRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const cash = rows.find((r) => r.method === "cash" && typeof r.amount === "number" && r.amount > 0);

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t("Payment mode")}
            value={r.method}
            onChange={(e) => set(i, { method: e.target.value as PaymentMode })}
            className="rounded-lg border border-border bg-surface px-2.5 py-2 text-sm"
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {t(paymentMethodLabel(m))}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            aria-label={t("Amount")}
            value={r.amount}
            onChange={(e) => set(i, { amount: e.target.value === "" ? "" : Math.max(0, Number(e.target.value)) })}
            className="w-28 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
          {r.method !== "cash" && (
            <input
              type="text"
              maxLength={100}
              placeholder={t("Ref (optional)")}
              value={r.reference}
              onChange={(e) => set(i, { reference: e.target.value })}
              className="min-w-0 flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          )}
          {rows.length > 1 && (
            <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={t("Remove payment")} className="rounded-lg border border-border p-2 text-muted">
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {rows.length < 10 && (
          <button
            type="button"
            onClick={() => onChange([...rows, { method: rows.some((r) => r.method === "upi") ? "card" : "upi", amount: left > 0 ? left : "", reference: "" }])}
            className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-brand-text"
          >
            <Plus size={13} /> {t("Add Payment")}
          </button>
        )}
        <button type="button" onClick={onSingle} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted">
          {t("Use one payment mode")}
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2 text-sm">
        <dt className="text-muted">{t("To pay")}</dt>
        <dd className="text-right font-medium">{formatMoney(payable)}</dd>
        <dt className="text-muted">{t("Total paid")}</dt>
        <dd className="text-right font-medium">{formatMoney(paid)}</dd>
        <dt className={left > 0.005 ? "text-credit" : "text-muted"}>{t("Udhaar (on khata)")}</dt>
        <dd className={`text-right font-semibold ${left > 0.005 ? "text-credit" : ""}`}>{formatMoney(Math.max(0, left))}</dd>
      </dl>
      {problem && <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">{t(problem)}</p>}
      {cash && <CashChange total={cash.amount as number} />}
    </div>
  );
}
