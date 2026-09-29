"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Circle, Coins } from "lucide-react";
import { setTodaysMetalRateAction } from "@/lib/actions/jewellery";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { useT } from "@/lib/i18n/LangContext";
import { BackLink } from "@/app/components/BackLink";
import { KARATS, type Karat } from "@/lib/metalRates";

type HistoryRow = { metalType: string; purity: string; rate: number; date: string };

/** Today's rates: gold for each karat (24K, 22K, 18K, 14K) and silver. */
export function RatesClient({
  todayGold,
  todaySilver,
  karatsAvailable,
  history,
}: {
  /** Today's rate saved for each karat (null = not set today). */
  todayGold: Record<Karat, number | null>;
  todaySilver: number | null;
  /** Rates per karat need migration 0047; before it there is one gold rate (read as 22K). */
  karatsAvailable: boolean;
  history: HistoryRow[];
}) {
  const { t } = useT();
  const router = useRouter();
  const karats = karatsAvailable ? KARATS : (["22K"] as const);
  const [gold, setGold] = useState<Record<string, number | "">>(Object.fromEntries(KARATS.map((k) => [k, todayGold[k] ?? ""])));
  const [silver, setSilver] = useState<number | "">(todaySilver ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function saveAll() {
    setError(null);
    setSaved(null);
    const goldToSave = karats.filter((k) => typeof gold[k] === "number" && (gold[k] as number) > 0);
    if (goldToSave.length === 0 && !(typeof silver === "number" && silver > 0)) {
      setError(t("Enter at least one rate"));
      return;
    }
    startTransition(async () => {
      for (const k of goldToSave) {
        const r = await setTodaysMetalRateAction("gold", gold[k] as number, k);
        if (r.error) return setError(r.error);
      }
      if (typeof silver === "number" && silver > 0) {
        const r = await setTodaysMetalRateAction("silver", silver);
        if (r.error) return setError(r.error);
      }
      setSaved(t("Saved — today's bills use these rates."));
      router.refresh();
    });
  }

  // Jewellers usually fix 24K and set the rest by gold content; they can still change any of them.
  function fillFrom24() {
    const base = gold["24K"];
    if (typeof base !== "number" || base <= 0) {
      setError(t("Enter the 24K rate first"));
      return;
    }
    setError(null);
    setGold((g) => ({ ...g, "22K": Math.round((base * 22) / 24), "18K": Math.round((base * 18) / 24), "14K": Math.round((base * 14) / 24) }));
  }

  const input = "flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/products" />
      <PageHeader title={t("Today's rate")} subtitle={t("Set the per-gram rate each morning — it applies to every gold/silver item billed today.")} icon={<Coins size={18} strokeWidth={1.8} />} />

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-brand-text">
          <Circle size={10} className="fill-amber-400 text-amber-400" /> {t("Gold (₹ per gram)")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {karats.map((k) => (
            <label key={k} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
              <span className="w-9 shrink-0 text-sm font-semibold text-foreground">{k}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={gold[k]}
                onChange={(e) => setGold((g) => ({ ...g, [k]: e.target.value === "" ? "" : Number(e.target.value) }))}
                className="w-full min-w-0 bg-transparent text-right text-sm outline-none"
                aria-label={`${k} ${t("rate")}`}
              />
            </label>
          ))}
        </div>
        {karatsAvailable && (
          <button type="button" onClick={fillFrom24} className="self-start text-xs font-medium text-brand-text">
            {t("Fill 22K, 18K and 14K from 24K")}
          </button>
        )}

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="flex items-center gap-1.5 font-medium text-brand-text">
            <Circle size={10} className="fill-slate-400 text-slate-400" /> {t("Silver rate (₹ per gram)")}
          </span>
          <input type="number" min="0" step="0.01" value={silver} onChange={(e) => setSilver(e.target.value === "" ? "" : Number(e.target.value))} className={input} />
        </label>

        {error && <p className="text-xs text-danger">{error}</p>}
        {saved && <p className="text-xs text-success">{saved}</p>}
        <button onClick={saveAll} disabled={isPending} className="btn-primary text-center disabled:opacity-60">
          {isPending ? t("Saving…") : t("Save today's rates")}
        </button>
      </div>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">{t("Recent rates")}</p>
        {history.length === 0 ? (
          <EmptyState text={t("No rates set yet.")} />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {history.map((h, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-2 text-sm">
                <span className="flex items-center gap-1.5 text-muted">
                  <Circle size={8} className={h.metalType === "gold" ? "fill-amber-400 text-amber-400" : "fill-slate-400 text-slate-400"} />{" "}
                  {new Date(h.date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}
                  {h.metalType === "gold" ? ` · ${h.purity || "22K"}` : ` · ${t("Silver")}`}
                </span>
                <span className="font-medium text-foreground">{formatMoney(h.rate)}/g</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
