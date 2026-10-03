"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/lib/link";
import { closeSchemeAction, recordSchemeInstallmentAction } from "@/lib/actions/goldSchemes";
import { formatMoney, paymentMethodLabel } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";

type Method = "cash" | "upi" | "card" | "online" | "other";

export function SchemeActions({
  schemeId,
  installment,
  remaining,
  paid,
  value,
  complete,
  customerId,
  isOwner,
  whatsapp,
}: {
  schemeId: string;
  installment: number;
  remaining: number;
  paid: number;
  value: number;
  complete: boolean;
  customerId: string | null;
  isOwner: boolean;
  whatsapp: string | null;
}) {
  const { t } = useT();
  const router = useRouter();
  const [mode, setMode] = useState<"pay" | "close" | null>(null);
  const [amount, setAmount] = useState<number | "">(Math.min(installment, remaining));
  const [method, setMethod] = useState<Method>("cash");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = "rounded-lg border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-brand";

  function submit() {
    setError(null);
    start(async () => {
      const value = typeof amount === "number" ? amount : 0;
      const r = mode === "close" ? await closeSchemeAction(schemeId, value, method) : await recordSchemeInstallmentAction(schemeId, value, method);
      if (r.error) {
        setError(r.error);
        return;
      }
      setMode(null);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-2">
      {!complete && mode !== "pay" && (
        <button type="button" onClick={() => { setMode("pay"); setAmount(Math.min(installment, remaining)); setError(null); }} className="btn-primary text-center">
          {t("Take instalment")}
        </button>
      )}
      {/* Buy jewellery with it: at maturity with the bonus, earlier with what has been paid. */}
      {customerId && (
        <Link href={`/bills/new?scheme=${schemeId}`} className={complete ? "btn-primary text-center" : "rounded-xl border border-brand bg-brand-soft px-4 py-3 text-center text-sm font-medium text-brand-text"}>
          {complete ? t("Buy jewellery with it — {amount}", { amount: formatMoney(value) }) : t("Buy jewellery now with {amount} paid (no bonus)", { amount: formatMoney(paid) })}
        </Link>
      )}
      <div className="flex flex-wrap gap-2">
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[#25D366] px-3 py-1.5 text-xs font-medium text-[#128C7E]">
            {t("Passbook / reminder on WhatsApp")}
          </a>
        )}
        {isOwner && mode !== "close" && (
          <button type="button" onClick={() => { setMode("close"); setAmount(paid); setError(null); }} className="rounded-full border border-danger px-3 py-1.5 text-xs font-medium text-danger">
            {t("Close and refund")}
          </button>
        )}
      </div>

      {mode && (
        <div className="neu-card flex flex-col gap-2 p-3.5">
          <p className="text-sm font-medium text-foreground">{mode === "close" ? t("Close the scheme — money handed back") : t("Instalment received")}</p>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))} className={input} aria-label={t("Amount")} />
            <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className={input}>
              {(["cash", "upi", "card", "online", "other"] as const).map((m) => (
                <option key={m} value={m}>
                  {t(paymentMethodLabel(m))}
                </option>
              ))}
            </select>
          </div>
          {mode === "close" && <p className="text-xs text-muted">{t("Paid in so far: {amount}. Enter what is handed back (0 if the customer forfeits it).", { amount: formatMoney(paid) })}</p>}
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={submit} disabled={pending} className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${mode === "close" ? "bg-danger" : "bg-brand"}`}>
              {pending ? t("Saving…") : mode === "close" ? t("Close scheme") : t("Save")}
            </button>
            <button type="button" onClick={() => setMode(null)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
              {t("Cancel")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
