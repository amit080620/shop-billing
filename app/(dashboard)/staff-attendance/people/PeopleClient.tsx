"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addLoginStaffToListAction, saveWorkerAction } from "@/lib/actions/payroll";
import type { Worker } from "@/lib/payrollData";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";

type Draft = { id: string | null; name: string; phone: string; designation: string; payType: "monthly" | "daily"; monthlySalary: string; dailyWage: string; joinedOn: string; isActive: boolean; commissionService: string; commissionProduct: string };
const empty: Draft = { id: null, name: "", phone: "", designation: "", payType: "monthly", monthlySalary: "", dailyWage: "", joinedOn: "", isActive: true, commissionService: "", commissionProduct: "" };

/** The payroll list: who works here and how they are paid. */
export function PeopleClient({ workers, loginsNotListed, showCommission = false }: { workers: Worker[]; loginsNotListed: number; /** Salons: a share of the services each person does. */ showCommission?: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(workers.length === 0 ? empty : null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function edit(w: Worker) {
    setError(null);
    setDraft({ id: w.id, name: w.name, phone: w.phone ?? "", designation: w.designation ?? "", payType: w.payType, monthlySalary: w.monthlySalary ? String(w.monthlySalary) : "", dailyWage: w.dailyWage ? String(w.dailyWage) : "", joinedOn: w.joinedOn ?? "", isActive: w.isActive, commissionService: w.commissionServicePercent ? String(w.commissionServicePercent) : "", commissionProduct: w.commissionProductPercent ? String(w.commissionProductPercent) : "" });
  }

  function save() {
    if (!draft) return;
    setError(null);
    start(async () => {
      const r = await saveWorkerAction({ ...draft, monthlySalary: Number(draft.monthlySalary) || 0, dailyWage: Number(draft.dailyWage) || 0, ...(showCommission ? { commissionServicePercent: Number(draft.commissionService) || 0, commissionProductPercent: Number(draft.commissionProduct) || 0 } : {}) });
      if (r.error) {
        setError(r.error);
        return;
      }
      setDraft(null);
      router.refresh();
    });
  }

  const input = "rounded-lg border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-brand";

  return (
    <div className="flex flex-col gap-3">
      {loginsNotListed > 0 && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await addLoginStaffToListAction();
              if (r.error) setError(r.error);
              router.refresh();
            })
          }
          className="rounded-xl border border-dashed border-brand px-4 py-3 text-sm font-medium text-brand-text disabled:opacity-60"
        >
          {t("Add your {n} staff logins to this list", { n: loginsNotListed })}
        </button>
      )}

      {draft ? (
        <div className="neu-card flex flex-col gap-2.5 p-4">
          <p className="text-sm font-semibold text-foreground">{draft.id ? t("Edit") : t("Add a person")}</p>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t("Name")} className={input} />
          <div className="grid grid-cols-2 gap-2">
            <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder={t("Phone (for the salary slip)")} inputMode="tel" className={input} />
            <input value={draft.designation} onChange={(e) => setDraft({ ...draft, designation: e.target.value })} placeholder={t("Work (e.g. Helper)")} className={input} />
          </div>
          <div className="flex gap-2">
            {(["monthly", "daily"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setDraft({ ...draft, payType: k })} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${draft.payType === k ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
                {k === "monthly" ? t("Monthly salary") : t("Daily wage")}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {draft.payType === "monthly" ? (
              <input type="number" min={0} value={draft.monthlySalary} onChange={(e) => setDraft({ ...draft, monthlySalary: e.target.value })} placeholder={t("Salary ₹ / month")} className={input} />
            ) : (
              <input type="number" min={0} value={draft.dailyWage} onChange={(e) => setDraft({ ...draft, dailyWage: e.target.value })} placeholder={t("Wage ₹ / day")} className={input} />
            )}
            <label className="flex flex-col text-[11px] text-muted">
              {t("Joined on")}
              <input type="date" value={draft.joinedOn} onChange={(e) => setDraft({ ...draft, joinedOn: e.target.value })} className={input} />
            </label>
          </div>
          {showCommission && (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col text-[11px] text-muted">
                {t("Commission on services %")}
                <input type="number" min={0} max={100} step="0.5" value={draft.commissionService} onChange={(e) => setDraft({ ...draft, commissionService: e.target.value })} placeholder="0" className={input} />
              </label>
              <label className="flex flex-col text-[11px] text-muted">
                {t("Commission on products %")}
                <input type="number" min={0} max={100} step="0.5" value={draft.commissionProduct} onChange={(e) => setDraft({ ...draft, commissionProduct: e.target.value })} placeholder="0" className={input} />
              </label>
            </div>
          )}
          {draft.id && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
              {t("Still working here")}
            </label>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={pending} className="btn-primary flex-1 text-center disabled:opacity-60">
              {pending ? t("Saving…") : t("Save")}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
              {t("Cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => { setError(null); setDraft(empty); }} className="btn-primary text-center">
          {t("+ Add a person")}
        </button>
      )}

      <ul className="flex flex-col gap-2">
        {workers.map((w) => (
          <li key={w.id}>
            <button type="button" onClick={() => edit(w)} className={`neu-card flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left ${w.isActive ? "" : "opacity-60"}`}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{w.name}</p>
                <p className="truncate text-xs text-muted">
                  {[w.designation, w.phone, showCommission && (w.commissionServicePercent || w.commissionProductPercent) ? `${t("Commission")} ${w.commissionServicePercent}% / ${w.commissionProductPercent}%` : null, w.isActive ? null : t("Left")].filter(Boolean).join(" · ")}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-foreground">
                {w.payType === "monthly" ? (w.monthlySalary > 0 ? `${formatMoney(w.monthlySalary)}/${t("mo")}` : t("Set salary")) : `${formatMoney(w.dailyWage)}/${t("day")}`}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
