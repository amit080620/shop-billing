"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Lock, RotateCcw, Wallet } from "lucide-react";
import { closeDayAction, reopenDayAction } from "@/lib/actions/dayClose";
import { countedFromDenominations, dayCloseFigures, DENOMINATIONS, type Denominations } from "@/lib/dayClose";
import type { DayCloseRow } from "@/lib/dayCloseData";
import { formatMoney, formatDateTime } from "@/lib/format";
import { formatIsoDate } from "@/lib/dateHelpers";
import { useT } from "@/lib/i18n/LangContext";

/** Closing the day: count the drawer against what should be in it, note what goes to the bank,
 * and carry the rest into tomorrow's opening cash. */
export function DayCloseCard({
  date,
  branchId,
  cashChange,
  close,
  suggestedOpening,
  suggestedFrom,
  recent,
  isOwner,
}: {
  date: string;
  branchId: string | null;
  /** The day's net cash, as the Daily summary shows it right now. */
  cashChange: number;
  close: DayCloseRow | null;
  suggestedOpening: number;
  suggestedFrom: string | null;
  recent: DayCloseRow[];
  isOwner: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<number | "">(suggestedOpening);
  const [counts, setCounts] = useState<Denominations>({});
  const [removed, setRemoved] = useState<number | "">("");
  const [note, setNote] = useState("");

  const counted = countedFromDenominations(counts);
  const f = dayCloseFigures({ openingCash: typeof opening === "number" ? opening : 0, cashChange, countedCash: counted, cashRemoved: typeof removed === "number" ? removed : 0 });

  function submit() {
    setError(null);
    start(async () => {
      const r = await closeDayAction({
        date,
        branchId,
        openingCash: typeof opening === "number" ? opening : 0,
        denominations: counts,
        countedCash: counted,
        cashRemoved: typeof removed === "number" ? removed : 0,
        note,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function reopen(id: string) {
    if (!confirm(t("Reopen this day so it can be counted again?"))) return;
    start(async () => {
      const r = await reopenDayAction(id);
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }

  const recentList = recent.filter((r) => r.businessDate !== date).slice(0, 6);

  if (close) {
    // Cash that came in or went out after the count — the drawer no longer matches the close.
    const since = Math.round((cashChange - close.cashChange) * 100) / 100;
    return (
      <section className="neu-card flex flex-col gap-2 p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Lock size={14} /> {t("Day closed")} · {formatIsoDate(date)}
        </h2>
        <p className="text-xs text-muted">
          {close.closedByName ?? ""} · {formatDateTime(close.closedAt)}
        </p>
        <Line label={t("Opening cash")} value={formatMoney(close.openingCash)} />
        <Line label={t("Day's cash change")} value={`${close.cashChange >= 0 ? "+" : "−"} ${formatMoney(Math.abs(close.cashChange))}`} />
        <Line label={t("Should be in the drawer")} value={formatMoney(close.expectedCash)} strong />
        <Line label={t("Counted")} value={formatMoney(close.countedCash)} strong />
        <DifferenceBadge difference={close.difference} t={t} />
        {close.cashRemoved > 0 && <Line label={t("Taken out (bank / home)")} value={formatMoney(close.cashRemoved)} />}
        <Line label={t("Left in the drawer for tomorrow")} value={formatMoney(close.carryForward)} />
        {close.note && <p className="text-xs text-muted">{t("Note")}: {close.note}</p>}
        {Math.abs(since) >= 1 && (
          <p className="rounded-lg bg-credit-soft px-3 py-2 text-xs text-credit">
            {since > 0 ? t("{amount} more cash came in after the count.", { amount: formatMoney(since) }) : t("{amount} of cash went out after the count.", { amount: formatMoney(-since) })}{" "}
            {isOwner ? t("Reopen the day to count again.") : t("Tell the owner.")}
          </p>
        )}
        {isOwner && (
          <button type="button" onClick={() => reopen(close.id)} disabled={pending} className="mt-1 flex items-center gap-1.5 self-start rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted disabled:opacity-60">
            <RotateCcw size={12} /> {t("Reopen the day")}
          </button>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
        <RecentCloses list={recentList} t={t} />
      </section>
    );
  }

  return (
    <section className="neu-card flex flex-col gap-3 p-4">
      <div>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Wallet size={14} /> {t("Close the day — count the cash")}
        </h2>
        <p className="mt-0.5 text-xs text-muted">{t("Count the notes in the drawer. The app checks them against what should be there.")}</p>
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted">
        {t("Opening cash (in the drawer this morning)")}
        <input
          type="number"
          min={0}
          step="0.01"
          value={opening}
          onChange={(e) => setOpening(e.target.value === "" ? "" : Number(e.target.value))}
          className="rounded-lg border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
        />
        {suggestedFrom && <span className="text-[11px]">{t("Left in the drawer when {date} was closed", { date: formatIsoDate(suggestedFrom) })}</span>}
      </label>

      <div className="rounded-lg bg-background px-3 py-2 text-sm">
        <Line label={t("Day's cash change")} value={`${cashChange >= 0 ? "+" : "−"} ${formatMoney(Math.abs(cashChange))}`} />
        <Line label={t("Should be in the drawer")} value={formatMoney(f.expected)} strong />
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-foreground">{t("Count the notes")}</p>
        <div className="grid grid-cols-2 gap-2">
          {DENOMINATIONS.map((note) => (
            <label key={note} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm">
              <span className="w-12 shrink-0 font-medium text-foreground">₹{note} ×</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={counts[note] ?? ""}
                onChange={(e) => setCounts((c) => ({ ...c, [note]: e.target.value === "" ? undefined : Math.max(0, Math.floor(Number(e.target.value))) }))}
                className="w-full min-w-0 bg-transparent text-right outline-none"
                aria-label={`₹${note}`}
              />
            </label>
          ))}
          <label className="col-span-2 flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm">
            <span className="shrink-0 font-medium text-foreground">{t("Coins")} ₹</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={counts.coins ?? ""}
              onChange={(e) => setCounts((c) => ({ ...c, coins: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) }))}
              className="w-full min-w-0 bg-transparent text-right outline-none"
              aria-label={t("Coins")}
            />
          </label>
        </div>
      </div>

      <div className="rounded-lg bg-background px-3 py-2 text-sm">
        <Line label={t("Counted")} value={formatMoney(counted)} strong />
        {counted > 0 && <DifferenceBadge difference={f.difference} t={t} />}
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted">
        {t("Cash taken out now (bank deposit / taken home)")}
        <input
          type="number"
          min={0}
          max={counted}
          step="0.01"
          value={removed}
          onChange={(e) => setRemoved(e.target.value === "" ? "" : Number(e.target.value))}
          className="rounded-lg border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
        />
      </label>
      <p className="text-xs text-foreground">
        {t("Left in the drawer for tomorrow")}: <b>{formatMoney(f.carryForward)}</b>
      </p>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("Note (e.g. ₹150 short — change given wrong)")}
        className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <button type="button" onClick={submit} disabled={pending || counted <= 0 && f.expected > 0} className="btn-primary w-full text-center disabled:opacity-60">
        {pending ? t("Saving…") : t("Close the day")}
      </button>
      <RecentCloses list={recentList} t={t} />
    </section>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className={strong ? "font-semibold text-foreground" : "text-foreground"}>{value}</span>
    </div>
  );
}

function DifferenceBadge({ difference, t }: { difference: number; t: (k: string, v?: Record<string, string | number>) => string }) {
  if (Math.abs(difference) < 1) {
    return (
      <p className="flex items-center gap-1 text-sm font-semibold text-success">
        <CheckCircle2 size={14} /> {t("Matches")}
      </p>
    );
  }
  return difference < 0 ? (
    <p className="text-sm font-semibold text-danger">{t("Short by {amount}", { amount: formatMoney(-difference) })}</p>
  ) : (
    <p className="text-sm font-semibold text-credit">{t("Extra {amount}", { amount: formatMoney(difference) })}</p>
  );
}

function RecentCloses({ list, t }: { list: DayCloseRow[]; t: (k: string) => string }) {
  if (!list.length) return null;
  return (
    <div className="mt-1 border-t border-border pt-2">
      <p className="mb-1 text-xs font-medium text-muted">{t("Earlier days")}</p>
      <ul className="flex flex-col gap-1">
        {list.map((r) => (
          <li key={r.id} className="flex items-center justify-between text-xs">
            <span className="text-foreground">{formatIsoDate(r.businessDate)}</span>
            <span className="text-muted">{formatMoney(r.countedCash)}</span>
            <span className={Math.abs(r.difference) < 1 ? "text-success" : r.difference < 0 ? "text-danger" : "text-credit"}>
              {Math.abs(r.difference) < 1 ? "✓" : `${r.difference < 0 ? "−" : "+"}${formatMoney(Math.abs(r.difference))}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
