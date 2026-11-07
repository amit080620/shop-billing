import Link from "@/lib/link";
import { ChevronRight, FileText, MessageCircle, Route, Truck, Undo2 } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { STATUS_LABEL, type TripStatus } from "@/lib/van/rules";
import { boardMessage, type BoardTotals, type BoardTrip } from "@/lib/van/dayBoard";

type T = (key: string, vars?: Record<string, string | number>) => string;

const STATUS_STYLE: Record<TripStatus, string> = {
  draft: "bg-surface-2 text-muted",
  loaded: "bg-brand-soft text-brand-text",
  returned: "bg-warning-soft text-warning",
  settled: "bg-success-soft text-success",
  cancelled: "bg-surface-2 text-muted",
};
const STEPS = ["Loaded", "On the route", "Back", "Settled"] as const;
const pcs = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

/** Today's vans on one board — Home's card (compact) and the Van desk. The same figures for the owner
 * and the salesman: the cash each van hands over, the UPI to check, the udhaar given and the stock still
 * on it, with the one thing to do next (settle a van that is back; bill, route or a return for the
 * salesman). Shared on WhatsApp in one tap, so everyone reads the same numbers. */
export function DayBoard({ trips, totals, t, canManage, compact = false, dateLabel }: { trips: BoardTrip[]; totals: BoardTotals; t: T; canManage: boolean; compact?: boolean; dateLabel: string }) {
  const message = boardMessage(trips, totals, dateLabel, t, (s) => t(STATUS_LABEL[s]));
  return (
    <section className="neu-card flex flex-col gap-3 p-4" aria-label={canManage ? t("Vans today") : t("My van today")}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Truck size={16} className="text-brand-text" /> {canManage ? t("Vans today") : t("My van today")}
        </h2>
        <span className="flex flex-wrap justify-end gap-1">
          {totals.waiting > 0 && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">{t("{n} back, to settle", { n: totals.waiting })}</span>}
          {totals.onRoute > 0 && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-text">{t("{n} on the route", { n: totals.onRoute })}</span>}
          {totals.settled > 0 && <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">{t("{n} settled", { n: totals.settled })}</span>}
        </span>
      </div>

      {/* What is still to come in: the evening's match at a glance. */}
      <div className="grid grid-cols-3 gap-2">
        <Figure label={canManage ? t("Cash to collect") : t("Cash to hand over")} value={formatMoney(totals.cashToCollect)} strong />
        <Figure label={t("UPI to check")} value={formatMoney(totals.upiToCheck)} />
        <Figure label={t("Stock on vans")} value={formatMoney(totals.stockValue)} sub={totals.stockPieces > 0 ? `${pcs(totals.stockPieces)} ${t("pcs")}` : undefined} />
      </div>
      <p className="text-[11px] text-muted">
        {t("Sold")} {formatMoney(totals.sold)} · {t("Udhaar")} {formatMoney(totals.credit)} · {t("Old dues")} {formatMoney(totals.collections)}
        {totals.short > 0 ? <span className="font-semibold text-danger"> · {t("Short today")} {formatMoney(totals.short)}</span> : null}
      </p>

      <ul className="flex flex-col gap-2">
        {trips.map((x) => (
          <li key={x.id} className={`rounded-xl border px-3 py-2.5 ${x.status === "returned" ? "border-warning bg-warning-soft" : "border-border"}`}>
            <Link href={`/van/trips/${x.id}`} className="flex flex-col gap-1.5">
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">{x.vehicle}</span>
                  <span className="block truncate text-[11px] text-muted">{[x.salesman, x.route].filter(Boolean).join(" · ") || x.number}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[x.status]}`}>{t(STATUS_LABEL[x.status])}</span>
              </span>
              {/* Loaded → on the route → back → settled. */}
              <span className="grid grid-cols-4 gap-1" aria-label={t(STEPS[x.step - 1])}>
                {STEPS.map((s, i) => (
                  <span key={s} className={`h-1 rounded-full ${i < x.step ? (x.step === 3 ? "bg-warning" : x.step === 4 ? "bg-success" : "bg-brand") : "bg-surface-2"}`} />
                ))}
              </span>
              <span className="grid grid-cols-4 gap-1 text-center">
                <Mini label={t("Sold")} value={formatMoney(x.sold)} />
                <Mini label={t("Cash")} value={formatMoney(x.cashToHand)} strong />
                <Mini label="UPI" value={formatMoney(x.upiToCheck)} />
                <Mini label={t("Udhaar")} value={formatMoney(x.credit)} />
              </span>
              <span className="flex items-center justify-between gap-2 text-[11px] text-muted">
                <span className="min-w-0 truncate">
                  {x.status === "settled"
                    ? x.difference === null || x.difference === 0
                      ? t("Cash matched")
                      : x.difference < 0
                        ? `${t("Cash short")} ${formatMoney(-x.difference)}`
                        : `${t("Cash over")} ${formatMoney(x.difference)}`
                    : x.stockPieces > 0
                      ? t("On van: {n} pcs ({value})", { n: pcs(x.stockPieces), value: formatMoney(x.stockValue) })
                      : t("Van is empty")}
                  {` · ${t("{n} bills", { n: x.bills })}`}
                </span>
                {!(canManage && x.status === "returned") && <ChevronRight size={14} className="shrink-0" />}
              </span>
            </Link>
            {canManage && x.status === "returned" && (
              <Link href={`/van/trips/${x.id}#settle`} className="btn-primary-sm mt-2 flex items-center justify-center gap-1">
                {t("Settle now")} <ChevronRight size={14} />
              </Link>
            )}
            {!canManage && x.status === "loaded" && (
              <span className="mt-2 grid grid-cols-3 gap-1.5">
                <Link href={`/bills/new?trip=${x.id}`} className="btn-primary-sm flex items-center justify-center gap-1 px-2">
                  <FileText size={13} /> {t("Bill")}
                </Link>
                <Link href={`/van/trips/${x.id}`} className="flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold text-foreground">
                  <Route size={13} /> {t("Route")}
                </Link>
                <Link href={`/van/trips/${x.id}/return`} className="flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold text-foreground">
                  <Undo2 size={13} /> {t("Return")}
                </Link>
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground">
          <MessageCircle size={14} /> {t("Send on WhatsApp")}
        </a>
        {compact && (
          <Link href="/van" className="flex items-center gap-0.5 text-xs font-semibold text-brand-text">
            {t("Open van desk")} <ChevronRight size={14} />
          </Link>
        )}
      </div>
    </section>
  );
}

function Figure({ label, value, sub, strong = false }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col rounded-lg px-2.5 py-2 ${strong ? "bg-brand-soft" : "bg-surface-2"}`}>
      <span className={`truncate text-[11px] ${strong ? "text-brand-text" : "text-muted"}`}>{label}</span>
      <span className={`truncate text-sm font-bold ${strong ? "text-brand-text" : "text-foreground"}`}>{value}</span>
      {sub && <span className="truncate text-[10px] text-muted">{sub}</span>}
    </div>
  );
}

function Mini({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-[10px] text-muted">{label}</span>
      <span className={`truncate text-xs ${strong ? "font-bold text-foreground" : "font-medium text-foreground"}`}>{value}</span>
    </span>
  );
}

/** Today in India, as the board's date ("7 Nov"). */
export const boardDate = () => new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
