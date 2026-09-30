"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { setCreditLimitAction } from "@/lib/actions/credit";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";

/** How much udhaar this customer may run up: what's used, what's left, and (for the owner) a way to change it. */
export function CreditLimitCard({ customerId, limit, balance, isOwner }: { customerId: string; limit: number | null; balance: number; isOwner: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<number | "">(limit ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const over = limit != null && balance > limit;
  const left = limit != null ? Math.max(0, limit - balance) : null;

  function save(next: number | null) {
    setError(null);
    start(async () => {
      const r = await setCreditLimitAction(customerId, next);
      if (r.error) return setError(r.error);
      setEditing(false);
      router.refresh();
    });
  }

  if (limit == null && !isOwner) return null;
  return (
    <section className={`flex flex-col gap-2 rounded-xl border p-3.5 ${over ? "border-danger bg-danger-soft" : "border-border bg-surface"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`flex items-center gap-1.5 text-sm font-semibold ${over ? "text-danger" : "text-foreground"}`}>
          <ShieldAlert size={15} /> {t("Udhaar limit")}
        </p>
        {isOwner && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-brand-text">
            {limit == null ? t("Set a limit") : t("Change")}
          </button>
        )}
      </div>
      {limit != null && !editing && (
        <p className={`text-xs ${over ? "text-danger" : "text-muted"}`}>
          {over
            ? t("Over the limit: owes {owes} against a limit of {limit}.", { owes: formatMoney(balance), limit: formatMoney(limit) })
            : t("{limit} limit · {owes} owed · {left} left", { limit: formatMoney(limit), owes: formatMoney(balance), left: formatMoney(left ?? 0) })}
        </p>
      )}
      {limit == null && !editing && <p className="text-xs text-muted">{t("No limit. Set one and New Bill warns before a sale takes this customer past it.")}</p>}
      {editing && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder={t("Limit ₹")}
            aria-label={t("Limit ₹")}
            className="w-32 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button type="button" disabled={pending || value === ""} onClick={() => save(typeof value === "number" ? value : null)} className="btn-primary-sm disabled:opacity-60">
            {pending ? t("Saving…") : t("Save")}
          </button>
          {limit != null && (
            <button type="button" disabled={pending} onClick={() => save(null)} className="text-xs font-medium text-danger">
              {t("Remove limit")}
            </button>
          )}
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted">
            {t("Cancel")}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  );
}
