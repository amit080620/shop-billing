"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { refundWalletAction, topUpWalletAction } from "@/lib/actions/salonExtras";
import { formatDateTime, formatMoney, paymentMethodLabel } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";
import type { PackageView, WalletEntry } from "@/lib/salonExtras";

type Method = "cash" | "upi" | "card" | "online" | "other";

/** A customer's prepaid balance (add money, what it paid for, hand it back) and their packages. */
export function PrepaidCard({
  customerId,
  balance,
  entries,
  packages,
  isOwner,
}: {
  customerId: string;
  balance: number;
  entries: WalletEntry[];
  packages: PackageView[];
  isOwner: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [mode, setMode] = useState<"add" | "close" | null>(null);
  const [money, setMoney] = useState<number | "">("");
  const [extra, setExtra] = useState<number | "">("");
  const [method, setMethod] = useState<Method>("cash");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = "rounded-lg border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-brand";

  function submit() {
    setError(null);
    start(async () => {
      const m = typeof money === "number" ? money : 0;
      const r =
        mode === "close"
          ? await refundWalletAction({ customerId, money: m, method })
          : await topUpWalletAction({ customerId, money: m, extra: typeof extra === "number" ? extra : 0, method });
      if (r.error) {
        setError(r.error);
        return;
      }
      setMode(null);
      setMoney("");
      setExtra("");
      router.refresh();
    });
  }

  const label = (e: WalletEntry) =>
    e.kind === "topup" ? t("Paid in") : e.kind === "refund" ? t("Handed back and closed") : t("Used in a bill");

  return (
    <section className="neu-card flex flex-col gap-2.5 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Wallet size={15} /> {t("Prepaid balance")}
        </p>
        <p className={`text-lg font-bold ${balance > 0 ? "text-success" : "text-muted"}`}>{formatMoney(balance)}</p>
      </div>

      {mode === null && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setMode("add"); setMethod("cash"); setError(null); }} className="btn-primary-sm">
            {t("+ Add money")}
          </button>
          {isOwner && balance > 0 && (
            <button type="button" onClick={() => { setMode("close"); setMoney(balance); setError(null); }} className="rounded-full border border-danger px-3 py-1.5 text-xs font-medium text-danger">
              {t("Hand back and close")}
            </button>
          )}
        </div>
      )}

      {mode && (
        <div className="flex flex-col gap-2 rounded-lg bg-background p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] text-muted">
              {mode === "close" ? t("Handed back ₹") : t("Paid now ₹")}
              <input type="number" min={0} value={money} onChange={(e) => setMoney(e.target.value === "" ? "" : Number(e.target.value))} className={input} />
            </label>
            {mode === "add" ? (
              <label className="flex flex-col gap-1 text-[11px] text-muted">
                {t("Extra from the shop ₹")}
                <input type="number" min={0} value={extra} onChange={(e) => setExtra(e.target.value === "" ? "" : Number(e.target.value))} placeholder="0" className={input} />
              </label>
            ) : (
              <span />
            )}
          </div>
          <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className={input} aria-label={t("Payment method")}>
            {(["cash", "upi", "card", "online", "other"] as const).map((m) => (
              <option key={m} value={m}>
                {t(paymentMethodLabel(m))}
              </option>
            ))}
          </select>
          {mode === "add" && typeof money === "number" && money > 0 && (
            <p className="text-xs text-foreground">
              {t("Balance goes up by")} <b>{formatMoney(money + (typeof extra === "number" ? extra : 0))}</b>
            </p>
          )}
          {mode === "close" && <p className="text-xs text-muted">{t("The whole balance of {amount} is closed; whatever isn't handed back lapses.", { amount: formatMoney(balance) })}</p>}
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={submit} disabled={pending} className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${mode === "close" ? "bg-danger" : "bg-brand"}`}>
              {pending ? t("Saving…") : mode === "close" ? t("Close balance") : t("Save")}
            </button>
            <button type="button" onClick={() => setMode(null)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
              {t("Cancel")}
            </button>
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <ul className="flex flex-col gap-1">
          {entries.slice(0, 6).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-muted">
                {formatDateTime(e.createdAt)} · {label(e)}
                {e.billId ? (
                  <>
                    {" · "}
                    <Link href={`/print/bill/${e.billId}`} className="text-brand-text underline">
                      {e.note ?? t("bill")}
                    </Link>
                  </>
                ) : e.note ? ` · ${e.note}` : ""}
              </span>
              <span className={`shrink-0 font-medium ${e.credit >= 0 ? "text-success" : "text-foreground"}`}>
                {e.credit >= 0 ? "+" : "−"}
                {formatMoney(Math.abs(e.credit))}
              </span>
            </li>
          ))}
        </ul>
      )}

      {packages.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
          <p className="text-xs font-semibold text-foreground">{t("Packages")}</p>
          {packages.map((p) => (
            <div key={p.id} className={`flex items-center justify-between gap-2 text-xs ${p.left > 0 && !p.expired && !p.cancelled ? "" : "opacity-60"}`}>
              <span className="min-w-0 truncate text-foreground">
                {p.name}
                <span className="text-muted">
                  {" · "}
                  {p.cancelled ? t("Cancelled") : p.expired ? t("Ran out on {date}", { date: p.expiresOn ?? "" }) : p.expiresOn ? t("till {date}", { date: p.expiresOn }) : t("no end date")}
                </span>
              </span>
              <span className="shrink-0 font-semibold text-foreground">
                {t("{left} of {total} left", { left: p.left, total: p.sessionsTotal })}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
