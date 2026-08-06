"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { addBatchAction } from "@/lib/actions/pharmacy";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary-sm disabled:opacity-60">
      {pending ? pendingLabel : label}
    </button>
  );
}

export function AddBatchForm({ productId, lang }: { productId: string; lang: Lang }) {
  const { t } = useTranslation(lang);
  const [state, formAction] = useActionState(addBatchAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
      <input type="hidden" name="productId" value={productId} />
      <p className="text-sm font-semibold text-brand-dark">{t("batches.addNew")}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-brand-dark">
          {t("batches.batchNumber")}
          <input name="batchNumber" required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brand-dark">
          {t("batches.quantity")}
          <input name="quantity" type="number" min="0.001" step="0.001" required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brand-dark">
          {t("batches.mfgDate")}
          <input name="mfgDate" type="date" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brand-dark">
          {t("batches.expiryDate")}
          <input name="expiryDate" type="date" required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brand-dark">
          {t("batches.manufacturer")}
          <input name="manufacturer" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brand-dark">
          {t("batches.costPrice")}
          <input name="purchasePrice" type="number" min="0" step="0.01" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
        </label>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <SubmitButton label={t("batches.add")} pendingLabel={t("batches.adding")} />
    </form>
  );
}
