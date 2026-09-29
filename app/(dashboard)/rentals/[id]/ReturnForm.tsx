"use client";

import { keepValuesOnError } from "@/lib/keepValuesOnError";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { returnRentalAction } from "@/lib/actions/rentals";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";
import { formatMoney } from "@/lib/format";
import { rentalReturnFigures } from "@/lib/rentalReturn";

type Item = { id: string; name: string; quantity: number };
type Condition = "good" | "damaged" | "missing";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full text-center disabled:opacity-60">
      {pending ? pendingLabel : label}
    </button>
  );
}

export function ReturnForm({ rentalId, items, lang, depositCollected, rentDue }: { rentalId: string; items: Item[]; lang: Lang; depositCollected: number; rentDue: number }) {
  const { t } = useTranslation(lang);
  const [conditions, setConditions] = useState<Record<string, Condition>>(
    Object.fromEntries(items.map((i) => [i.id, "good" as Condition])),
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [damageCharge, setDamageCharge] = useState<number | "">("");
  const [lateFee, setLateFee] = useState<number | "">("");
  const [useDepositForDue, setUseDepositForDue] = useState(true);
  // What happens to the deposit, before saving — so the counter knows what to hand back.
  const figures = rentalReturnFigures({
    depositCollected,
    rentDue,
    damageCharge: typeof damageCharge === "number" ? damageCharge : 0,
    lateFee: typeof lateFee === "number" ? lateFee : 0,
    useDepositForRentDue: useDepositForDue,
  });

  const [state, formAction] = useActionState(keepValuesOnError(returnRentalAction), null);

  const itemsPayload = JSON.stringify(
    items.map((i) => ({ rentalItemId: i.id, condition: conditions[i.id] ?? "good", damageNotes: notes[i.id] || undefined })),
  );

  const conditionLabel = (c: Condition) =>
    c === "good" ? t("rentalsPage.conditionGood") : c === "damaged" ? t("rentalsPage.conditionDamaged") : t("rentalsPage.conditionMissing");

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <p className="text-sm font-semibold text-brand-text">{t("rentalsPage.processReturn")}</p>
      <input type="hidden" name="rentalId" value={rentalId} />
      <input type="hidden" name="items" value={itemsPayload} />

      {items.map((item) => (
        <div key={item.id} className="flex flex-col gap-1.5 rounded-lg bg-surface p-2.5">
          <p className="text-xs font-medium text-foreground">{item.name} × {item.quantity}</p>
          <div className="flex gap-1.5">
            {(["good", "damaged", "missing"] as Condition[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setConditions((prev) => ({ ...prev, [item.id]: c }))}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${
                  conditions[item.id] === c ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
                }`}
              >
                {conditionLabel(c)}
              </button>
            ))}
          </div>
          {conditions[item.id] !== "good" && (
            <input
              value={notes[item.id] ?? ""}
              onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
              placeholder={t("rentalsPage.whatHappened")}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs outline-none focus:border-brand"
            />
          )}
        </div>
      ))}

      <label className="flex flex-col gap-1 text-xs text-brand-text">
        {t("rentalsPage.damageChargeLabel")}
        <input
          name="damageCharge"
          type="number"
          min={0}
          step="0.01"
          value={damageCharge}
          onChange={(e) => setDamageCharge(e.target.value === "" ? "" : Number(e.target.value))}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-brand-text">
        {t("rentalsPage.lateFeeLabel")}
        <input
          name="lateFee"
          type="number"
          min={0}
          step="0.01"
          value={lateFee}
          onChange={(e) => setLateFee(e.target.value === "" ? "" : Number(e.target.value))}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      {rentDue > 0 && depositCollected > 0 && (
        <label className="flex items-start gap-2 text-xs text-foreground">
          <input type="checkbox" name="useDepositForDue" checked={useDepositForDue} onChange={(e) => setUseDepositForDue(e.target.checked)} className="mt-0.5" />
          <span>{t("Take the unpaid rent")} ({formatMoney(rentDue)}) {t("out of the deposit")}</span>
        </label>
      )}
      {depositCollected > 0 && (
        <div className="rounded-lg bg-background px-3 py-2 text-xs">
          <div className="flex justify-between text-muted"><span>{t("Deposit collected")}</span><span>{formatMoney(depositCollected)}</span></div>
          {figures.charges > 0 && <div className="flex justify-between text-muted"><span>{t("Damage + late fee")}</span><span>− {formatMoney(Math.min(figures.charges, depositCollected))}</span></div>}
          {figures.rentPaidFromDeposit > 0 && <div className="flex justify-between text-muted"><span>{t("Unpaid rent")}</span><span>− {formatMoney(figures.rentPaidFromDeposit)}</span></div>}
          <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold text-foreground"><span>{t("Hand back to the customer")}</span><span>{formatMoney(figures.depositReturned)}</span></div>
          {figures.creditAfter > 0 && <div className="mt-0.5 flex justify-between font-medium text-credit"><span>{t("Customer still owes")}</span><span>{formatMoney(figures.creditAfter)}</span></div>}
        </div>
      )}

      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <SubmitButton label={t("rentalsPage.markReturned")} pendingLabel={t("rentalsPage.saving")} />
    </form>
  );
}
