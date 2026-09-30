"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteWorkerPaymentAction, recordWorkerPaymentAction } from "@/lib/actions/payroll";
import type { Payment, Worker } from "@/lib/payrollData";
import type { monthPay } from "@/lib/payroll";
import { formatMoney, formatDateTime, paymentMethodLabel } from "@/lib/format";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { useT } from "@/lib/i18n/LangContext";

type Row = { worker: Worker; pay: ReturnType<typeof monthPay>; advances: number; bonuses: number; salaryPaid: number; payments: Payment[] };
type Kind = "advance" | "salary" | "bonus";
type Method = "cash" | "upi" | "card" | "online" | "other";

/** The month's pay, one card per person: what was earned, what was already given, what is due. */
export function SalaryClient({ month, monthLabel, shopName, isOwner, rows }: { month: string; monthLabel: string; shopName: string; isOwner: boolean; rows: Row[] }) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState<{ workerId: string; kind: Kind } | null>(null);
  const [amount, setAmount] = useState<number | "">("");
  const [method, setMethod] = useState<Method>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function begin(r: Row, kind: Kind) {
    setError(null);
    setNote("");
    setOpen({ workerId: r.worker.id, kind });
    setAmount(kind === "salary" && r.pay.due > 0 ? r.pay.due : "");
  }

  function save() {
    if (!open) return;
    start(async () => {
      const res = await recordWorkerPaymentAction({ workerId: open.workerId, month, kind: open.kind, amount: typeof amount === "number" ? amount : 0, method, note });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(null);
      router.refresh();
    });
  }

  function slip(r: Row) {
    const p = r.pay;
    const lines = [
      `*${shopName}*`,
      `${t("Salary slip")} — ${monthLabel}`,
      r.worker.name,
      "",
      r.worker.payType === "monthly" ? `${t("Monthly salary")}: ${formatMoney(r.worker.monthlySalary)}` : `${t("Daily wage")}: ${formatMoney(r.worker.dailyWage)} × ${p.present + p.half * 0.5}`,
      p.absent ? `${t("Absent")}: ${p.absent} ${p.absent === 1 ? t("day") : t("days")}` : "",
      p.half ? `${t("Half days")}: ${p.half}` : "",
      p.beforeJoining ? `${t("Joined on day")} ${p.beforeJoining + 1}` : "",
      p.commission ? `${t("Commission")}: +${formatMoney(p.commission)}` : "",
      `*${t("Earned")}: ${formatMoney(p.earned)}*`,
      r.bonuses ? `${t("Bonus")}: +${formatMoney(r.bonuses)}` : "",
      r.advances ? `${t("Advance")}: −${formatMoney(r.advances)}` : "",
      r.salaryPaid ? `${t("Paid")}: −${formatMoney(r.salaryPaid)}` : "",
      `*${t("Balance")}: ${formatMoney(p.due)}*`,
    ].filter(Boolean);
    return r.worker.phone ? buildWhatsAppLink(r.worker.phone, lines.join("\n")) : null;
  }

  const kindLabel = (k: Kind) => (k === "advance" ? t("Advance") : k === "salary" ? t("Salary") : t("Bonus"));

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => {
        const p = r.pay;
        const wa = slip(r);
        return (
          <li key={r.worker.id} className="neu-card flex flex-col gap-2 px-3.5 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{r.worker.name}</p>
                <p className="text-xs text-muted">
                  {r.worker.payType === "monthly" ? `${formatMoney(r.worker.monthlySalary)}/${t("mo")}` : `${formatMoney(r.worker.dailyWage)}/${t("day")} · ${p.present + p.half * 0.5} ${p.present + p.half * 0.5 === 1 ? t("day") : t("days")}`}
                  {p.absent ? ` · ${t("Absent")} ${p.absent}` : ""}
                  {p.half ? ` · ${t("Half")} ${p.half}` : ""}
                  {p.leave ? ` · ${t("Leave")} ${p.leave}` : ""}
                </p>
                {p.commission > 0 && <p className="text-xs font-medium text-brand-text">{t("Commission")} +{formatMoney(p.commission)} ({t("in Earned")})</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-base font-bold ${p.due > 0 ? "text-credit" : "text-success"}`}>{formatMoney(Math.abs(p.due))}</p>
                <p className="text-[11px] text-muted">{p.due > 0 ? t("to pay") : p.due < 0 ? t("paid extra") : t("settled")}</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1 text-center text-[11px]">
              <div>
                <p className="text-muted">{t("Earned")}</p>
                <p className="font-semibold text-foreground">{formatMoney(p.earned)}</p>
              </div>
              <div>
                <p className="text-muted">{t("Bonus")}</p>
                <p className="font-semibold text-foreground">{formatMoney(r.bonuses)}</p>
              </div>
              <div>
                <p className="text-muted">{t("Advance")}</p>
                <p className="font-semibold text-foreground">{formatMoney(r.advances)}</p>
              </div>
              <div>
                <p className="text-muted">{t("Paid")}</p>
                <p className="font-semibold text-foreground">{formatMoney(r.salaryPaid)}</p>
              </div>
            </div>

            {open?.workerId === r.worker.id ? (
              <div className="flex flex-col gap-2 rounded-lg bg-background p-2.5">
                <p className="text-xs font-medium text-foreground">{kindLabel(open.kind)} — {r.worker.name}</p>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))} placeholder="₹" className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
                  <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className="rounded-lg border border-border px-2 py-2 text-sm outline-none focus:border-brand">
                    {(["cash", "upi", "card", "online", "other"] as const).map((m) => (
                      <option key={m} value={m}>
                        {t(paymentMethodLabel(m))}
                      </option>
                    ))}
                  </select>
                </div>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Note (optional)")} className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
                {error && <p className="text-xs text-danger">{error}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={save} disabled={pending} className="btn-primary-sm flex-1 disabled:opacity-60">
                    {pending ? t("Saving…") : t("Save")}
                  </button>
                  <button type="button" onClick={() => setOpen(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
                    {t("Cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => begin(r, "advance")} className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground">
                  {t("Give advance")}
                </button>
                <button type="button" onClick={() => begin(r, "salary")} className="rounded-full border border-brand bg-brand-soft px-3 py-1 text-xs font-medium text-brand-text">
                  {t("Pay salary")}
                </button>
                <button type="button" onClick={() => begin(r, "bonus")} className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground">
                  {t("Bonus")}
                </button>
                {wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[#25D366] px-3 py-1 text-xs font-medium text-[#128C7E]">
                    {t("Slip on WhatsApp")}
                  </a>
                )}
              </div>
            )}

            {r.payments.length > 0 && (
              <ul className="flex flex-col gap-0.5 border-t border-border pt-1.5">
                {r.payments.map((pm) => (
                  <li key={pm.id} className="flex items-center justify-between gap-2 text-[11px] text-muted">
                    <span>
                      {kindLabel(pm.kind)} · {formatDateTime(pm.createdAt)} · {t(paymentMethodLabel(pm.method))}
                      {pm.note ? ` · ${pm.note}` : ""}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{formatMoney(pm.amount)}</span>
                      {isOwner && (
                        <button
                          type="button"
                          aria-label={t("Remove")}
                          onClick={() => {
                            if (!confirm(t("Remove this payment?"))) return;
                            start(async () => {
                              await deleteWorkerPaymentAction(pm.id);
                              router.refresh();
                            });
                          }}
                          className="text-danger"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
