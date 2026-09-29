"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGoldSchemeAction } from "@/lib/actions/goldSchemes";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { formatMoney, paymentMethodLabel } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";

type Method = "cash" | "upi" | "card" | "online" | "other";

/** Starts a scheme: customer, monthly instalment, how many months, the bonus — and usually the
 * first instalment, taken now. */
export function NewSchemeForm({ customers }: { customers: { id: string; name: string; phone: string | null }[] }) {
  const { t, lang } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState<{ id: string; name: string; phone: string | null } | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [installment, setInstallment] = useState<number | "">(5000);
  const [months, setMonths] = useState(11);
  const [bonus, setBonus] = useState<number | "">(5000);
  const [bonusTouched, setBonusTouched] = useState(false);
  const [payNow, setPayNow] = useState(true);
  const [method, setMethod] = useState<Method>("cash");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const inst = typeof installment === "number" ? installment : 0;
  const bon = typeof bonus === "number" ? bonus : 0;
  const input = "rounded-lg border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-brand";

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary text-center">
        {t("+ Start a scheme")}
      </button>
    );
  }

  function save() {
    setError(null);
    start(async () => {
      const r = await createGoldSchemeAction({
        customerId: customer?.id ?? null,
        name,
        phone,
        installmentAmount: inst,
        totalInstallments: months,
        bonusAmount: bon,
        firstPayment: payNow ? { method } : null,
        notes: "",
      });
      if (r.error && !r.schemeId) {
        setError(r.error);
        return;
      }
      router.push(`/jewellery/schemes/${r.schemeId}`);
    });
  }

  return (
    <div className="neu-card flex flex-col gap-2.5 p-4">
      <p className="text-sm font-semibold text-foreground">{t("Start a scheme")}</p>
      {customer ? (
        <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm">
          <span className="text-foreground">
            {customer.name} {customer.phone ? `· ${customer.phone}` : ""}
          </span>
          <button type="button" onClick={() => setCustomer(null)} className="text-xs text-muted">
            {t("Change")}
          </button>
        </div>
      ) : (
        <>
          <SearchableSelect lang={lang} items={customers} getKey={(c) => c.id} getLabel={(c) => c.name} getSubLabel={(c) => c.phone ?? ""} onSelect={setCustomer} placeholder={t("Pick a customer, or type a new one below")} />
          <div className="grid grid-cols-2 gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Name")} className={input} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("Phone")} inputMode="tel" className={input} />
          </div>
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          {t("Monthly instalment ₹")}
          <input
            type="number"
            min={1}
            value={installment}
            onChange={(e) => {
              const v = e.target.value === "" ? "" : Number(e.target.value);
              setInstallment(v);
              // The usual bonus is one instalment, until the owner types their own.
              if (!bonusTouched) setBonus(v);
            }}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          {t("Months")}
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className={input}>
            {[6, 10, 11, 12, 18, 24].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[11px] text-muted">
        {t("Bonus from the shop at the end ₹")}
        <input type="number" min={0} value={bonus} onChange={(e) => { setBonusTouched(true); setBonus(e.target.value === "" ? "" : Number(e.target.value)); }} className={input} />
      </label>
      {inst > 0 && (
        <p className="rounded-lg bg-background px-3 py-2 text-xs text-foreground">
          {formatMoney(inst)} × {months} = {formatMoney(inst * months)} + {t("bonus")} {formatMoney(bon)} = <b>{formatMoney(inst * months + bon)}</b> {t("of jewellery")}
        </p>
      )}
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />
        {t("First instalment paid now")}
      </label>
      {payNow && (
        <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className={input}>
          {(["cash", "upi", "card", "online", "other"] as const).map((m) => (
            <option key={m} value={m}>
              {t(paymentMethodLabel(m))}
            </option>
          ))}
        </select>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={pending} className="btn-primary flex-1 text-center disabled:opacity-60">
          {pending ? t("Saving…") : t("Start scheme")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
          {t("Cancel")}
        </button>
      </div>
    </div>
  );
}
