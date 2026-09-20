"use client";

import { keepValuesOnError } from "@/lib/keepValuesOnError";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { adminAssignPlanAction } from "@/lib/actions/admin-plans";
import { MODULES } from "@/lib/modules";
import { PLANS, planFor, type PlanKey } from "@/lib/plans";
import { PlanBadge } from "@/app/components/PlanBadge";

const CHOICES: PlanKey[] = ["free", "basic", "pro", "pro_plus", "custom"];
const DURATIONS = [
  { months: 1, label: "1 month" },
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "12 months (yearly)" },
  { months: 24, label: "24 months" },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 disabled:opacity-60">
      {pending ? "Saving…" : "Activate plan"}
    </button>
  );
}

const inputClass = "rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-gray-500";

/** Where payment turns into access: pick a plan, how long, what was
 * received, and the shop is switched over. Custom reveals the module and
 * limit pickers for the rare bespoke deal. */
export function PlanForm({ shopId, currentPlan, disabled }: { shopId: string; currentPlan: PlanKey; disabled?: boolean }) {
  const [state, formAction] = useActionState(keepValuesOnError(adminAssignPlanAction), null);
  const [plan, setPlan] = useState<PlanKey>(currentPlan);
  const [months, setMonths] = useState(12);
  const suggested = plan === "free" || plan === "custom" ? 0 : months === 12 ? planFor(plan).priceYearly : planFor(plan).priceMonthly * months;

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
      <input type="hidden" name="shopId" value={shopId} />
      <input type="hidden" name="plan" value={plan} />
      <p className="text-sm font-medium">Assign plan</p>
      {disabled && (
        <p className="rounded-lg border border-amber-700/50 bg-amber-900/30 px-3 py-2 text-xs text-amber-300">
          The database update for plans hasn&apos;t been run yet, so this can&apos;t save. See the notice on the shops page.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {CHOICES.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setPlan(key)}
            aria-pressed={plan === key}
            className={`flex flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left ${plan === key ? "border-white bg-gray-800" : "border-gray-700"}`}
          >
            <PlanBadge plan={key} />
            <span className="text-[11px] text-gray-400">
              {key === "free" ? "₹0" : key === "custom" ? "You set it" : `₹${PLANS[key].priceYearly.toLocaleString("en-IN")} / year`}
            </span>
          </button>
        ))}
      </div>

      {plan !== "free" && (
        <label className="flex flex-col gap-1 text-xs text-gray-300">
          Runs for
          <select name="months" value={months} onChange={(e) => setMonths(Number(e.target.value))} className={inputClass}>
            {DURATIONS.map((d) => (
              <option key={d.months} value={d.months}>
                {d.label}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-gray-500">Renewing the same plan adds to the days already left. Or set an exact end date below.</span>
        </label>
      )}
      {plan !== "free" && (
        <label className="flex flex-col gap-1 text-xs text-gray-300">
          Exact end date — optional, overrides the above
          <input name="validUntil" type="date" className={inputClass} />
        </label>
      )}

      <label className="flex flex-col gap-1 text-xs text-gray-300">
        Amount received (₹){suggested > 0 ? ` — list price ₹${suggested.toLocaleString("en-IN")}` : ""}
        <input name="amount" type="number" step="0.01" placeholder={suggested ? String(suggested) : "0"} className={inputClass} />
      </label>

      {plan === "custom" && (
        <div className="flex flex-col gap-3 rounded-lg border border-gray-700 p-3">
          <p className="text-xs font-medium text-gray-200">Custom plan</p>
          <label className="flex flex-col gap-1 text-xs text-gray-300">
            Price agreed (₹ / year) — for your records
            <input name="planPrice" type="number" step="1" min="0" className={inputClass} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["limitBills", "Bills / month"],
              ["limitProducts", "Items"],
              ["limitStaff", "Logins"],
              ["limitBranches", "Branches"],
            ].map(([name, label]) => (
              <label key={name} className="flex flex-col gap-1 text-xs text-gray-300">
                {label}
                <input name={name} type="number" min="0" placeholder="Unlimited" className={inputClass} />
              </label>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-gray-300">Modules included</p>
            {MODULES.map((m) => (
              <label key={m.key} className="flex items-start gap-2 text-xs text-gray-300">
                <input type="checkbox" name="modules" value={m.key} defaultChecked className="mt-0.5" />
                <span>
                  {m.label} <span className="text-gray-500">— {m.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <label className="flex flex-col gap-1 text-xs text-gray-300">
        Note
        <input name="note" placeholder="e.g. paid via UPI, ref 1234" className={inputClass} />
      </label>

      {state?.error && <p className="text-xs text-red-400">{state.error}</p>}
      {state?.success && <p className="text-xs text-emerald-400">Plan updated — it takes effect within a few seconds.</p>}
      <SubmitButton />
    </form>
  );
}
