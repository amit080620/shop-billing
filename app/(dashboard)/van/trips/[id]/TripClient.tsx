"use client";

import { useMemo, useState } from "react";
import Link from "@/lib/link";
import { FileText, Plus, Printer, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";
import { formatDateTime, formatMoney } from "@/lib/format";
import { addExpenseAction, cancelTripAction, loadTripAction, removeExpenseAction, returnTripAction, settleTripAction } from "@/lib/actions/van";
import { cashDifference, countResult, EXPENSE_KINDS, EXPENSE_LABEL, type TripStatus } from "@/lib/van/rules";
import type { RouteShop, TripBill, TripCount, TripExpense, TripItem, TripRow, Visit } from "@/lib/van/data";
import { useTripTracker, type Fix } from "@/lib/van/useTripTracker";
import { pingEnd, RouteSection } from "./RouteSection";
import { ErrorNote, LoadLines, TripStatusChip, useRun, type LoadItem, type LoadLine } from "../../ui";

type Money = { openingCash: number; cashBills: number; upiBills: number; otherBills: number; creditBills: number; cashCollections: number; upiCollections: number; expenses: number; cashExpected: number; upiExpected: number; sold: number; collections: number };
type Data = { trip: TripRow; items: TripItem[]; bills: TripBill[]; expenses: TripExpense[]; counts: TripCount[]; money: Money };

const q = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, ""));

export function TripClient({ data, canManage, loadItems, shops, visits }: { data: Data; canManage: boolean; loadItems: LoadItem[]; shops: RouteShop[]; visits: Visit[] }) {
  const { t } = useT();
  const { trip, items, bills, expenses, counts, money } = data;
  const status = trip.status as TripStatus;
  const open = status === "loaded" || status === "returned";
  // Location only while the trip is on the route (route tracking).
  const { fix, state } = useTripTracker(status === "loaded" ? trip.id : null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <TripStatusChip status={status} />
        {trip.loadedAt && <span>{t("Loaded")} {formatDateTime(trip.loadedAt)}</span>}
        {trip.returnedAt && <span>· {t("Back")} {formatDateTime(trip.returnedAt)}</span>}
        {trip.settledAt && status === "settled" && <span>· {t("Settled")} {formatDateTime(trip.settledAt)}</span>}
        <Link href={`/print/van-trip/${trip.id}`} className="ml-auto flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 font-medium text-foreground">
          <Printer size={13} /> {status === "settled" ? t("Settlement sheet") : t("Load sheet")}
        </Link>
      </div>

      {status === "loaded" && (
        <Link href={`/bills/new?trip=${trip.id}`} className="btn-primary flex items-center justify-center gap-2">
          <FileText size={16} /> {t("Make a bill from the van")}
        </Link>
      )}

      {status === "draft" && canManage && <LoadSection tripId={trip.id} items={loadItems} title={t("Load sheet")} button={t("Load the van")} />}

      {status !== "draft" && status !== "cancelled" && <RouteSection tripId={trip.id} shops={shops} visits={visits} fix={fix} state={state} onRoute={status === "loaded"} />}

      <Stock items={items} status={status} />

      {status === "loaded" && canManage && <LoadSection tripId={trip.id} items={loadItems} title={t("Top up during the day")} button={t("Add to the van")} collapsed />}

      <Bills bills={bills} />
      <Expenses tripId={trip.id} expenses={expenses} open={open} canManage={canManage} />
      <MoneyCard money={money} trip={trip} />

      {status === "loaded" && <BackButton tripId={trip.id} fix={fix} />}
      {open && canManage && <Settle tripId={trip.id} items={items} money={money} />}
      {status === "settled" && <Settled counts={counts} trip={trip} />}
      {status === "draft" && canManage && <CancelButton tripId={trip.id} />}
    </div>
  );
}

function LoadSection({ tripId, items, title, button, collapsed = false }: { tripId: string; items: LoadItem[]; title: string; button: string; collapsed?: boolean }) {
  const { t } = useT();
  const { run, pending, error } = useRun();
  const [lines, setLines] = useState<LoadLine[]>([]);
  const [shown, setShown] = useState(!collapsed);
  if (!shown) {
    return (
      <button type="button" onClick={() => setShown(true)} className="flex items-center justify-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground">
        <Plus size={15} /> {title}
      </button>
    );
  }
  return (
    <section className="neu-card flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <LoadLines items={items} lines={lines} onChange={setLines} />
      <ErrorNote error={error} />
      <button type="button" disabled={pending || lines.length === 0} onClick={() => run(() => loadTripAction(tripId, lines), () => setLines([]))} className="btn-primary disabled:opacity-60">
        {pending ? t("Loading…") : button}
      </button>
    </section>
  );
}

function Stock({ items, status }: { items: TripItem[]; status: TripStatus }) {
  const { t } = useT();
  if (!items.length) return null;
  const live = status === "loaded" || status === "returned" || status === "draft";
  return (
    <section className="neu-card flex flex-col gap-2 p-4">
      <h2 className="text-sm font-semibold text-foreground">{t("Van stock")}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 font-medium">{t("Item")}</th>
              <th className="py-1 text-right font-medium">{t("Loaded")}</th>
              <th className="py-1 text-right font-medium">{t("Sold")}</th>
              {live && <th className="py-1 text-right font-medium">{t("On van")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((i) => (
              <tr key={i.productId}>
                <td className="py-1.5 pr-2 text-foreground">{i.name}</td>
                <td className="py-1.5 text-right text-muted">{q(i.loaded)}</td>
                <td className="py-1.5 text-right text-muted">{q(i.sold)}</td>
                {live && <td className="py-1.5 text-right font-semibold text-foreground">{q(i.onVan)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Bills({ bills }: { bills: TripBill[] }) {
  const { t } = useT();
  return (
    <section className="neu-card flex flex-col gap-2 p-4">
      <h2 className="text-sm font-semibold text-foreground">
        {t("Bills on this trip")} ({bills.filter((b) => b.status === "active").length})
      </h2>
      {bills.length === 0 && <p className="text-xs text-muted">{t("No bills yet.")}</p>}
      <ul className="flex flex-col divide-y divide-border">
        {bills.map((b) => (
          <li key={b.id}>
            <Link href={`/print/bill/${b.id}`} className={`flex items-center justify-between gap-3 py-2 text-sm ${b.status === "voided" ? "opacity-60 line-through" : ""}`}>
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">
                  {b.number} {b.customer ? `· ${b.customer}` : ""}
                </span>
                <span className="block text-xs text-muted">{formatDateTime(b.createdAt)}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-semibold text-foreground">{formatMoney(b.total)}</span>
                {b.credit > 0 && <span className="block text-xs text-credit">{t("Udhaar")} {formatMoney(b.credit)}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Expenses({ tripId, expenses, open, canManage }: { tripId: string; expenses: TripExpense[]; open: boolean; canManage: boolean }) {
  const { t } = useT();
  const { run, pending, error } = useRun();
  const [kind, setKind] = useState<string>("diesel");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  return (
    <section className="neu-card flex flex-col gap-2 p-4">
      <h2 className="text-sm font-semibold text-foreground">{t("Trip expenses")}</h2>
      <ul className="flex flex-col divide-y divide-border">
        {expenses.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
            <span className="min-w-0 truncate text-foreground">
              {t(EXPENSE_LABEL[e.kind as keyof typeof EXPENSE_LABEL] ?? e.kind)}
              {e.note ? <span className="text-xs text-muted"> · {e.note}</span> : null}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="font-medium text-foreground">{formatMoney(e.amount)}</span>
              {open && canManage && (
                <button type="button" aria-label={t("Remove")} disabled={pending} onClick={() => run(() => removeExpenseAction(e.id))} className="rounded-full p-1 text-muted hover:bg-surface-2">
                  <Trash2 size={14} />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {open && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t("Expense")} className="rounded-lg px-3 py-2 text-sm">
              {EXPENSE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(EXPENSE_LABEL[k])}
                </option>
              ))}
            </select>
            <input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t("₹")} aria-label={t("Amount")} className="rounded-lg px-3 py-2 text-sm" />
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Note (optional)")} className="rounded-lg px-3 py-2 text-sm" />
          <ErrorNote error={error} />
          <button type="button" disabled={pending || !amount} onClick={() => run(() => addExpenseAction(tripId, { kind, amount: Number(amount), note }), () => { setAmount(""); setNote(""); })} className="self-start rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground disabled:opacity-60">
            {t("Add expense")}
          </button>
        </div>
      )}
    </section>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold text-foreground" : ""}`}>
      <span className={strong ? "" : "text-muted"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function MoneyCard({ money, trip }: { money: Money; trip: TripRow }) {
  const { t } = useT();
  return (
    <section className="neu-card flex flex-col gap-1 p-4 text-sm">
      <h2 className="mb-1 text-sm font-semibold text-foreground">{t("Money on this trip")}</h2>
      <Row label={t("Sold")} value={formatMoney(money.sold)} />
      <Row label={t("Cash on bills")} value={formatMoney(money.cashBills)} />
      <Row label={t("UPI on bills")} value={formatMoney(money.upiBills)} />
      {money.otherBills > 0 && <Row label={t("Card / other on bills")} value={formatMoney(money.otherBills)} />}
      <Row label={t("Udhaar on bills")} value={formatMoney(money.creditBills)} />
      <Row label={t("Old dues collected")} value={formatMoney(money.collections)} />
      <Row label={t("Cash given for change")} value={formatMoney(money.openingCash)} />
      <Row label={t("Expenses")} value={`− ${formatMoney(money.expenses)}`} />
      <div className="mt-1 border-t border-border pt-1">
        <Row label={t("Cash to hand over")} value={formatMoney(trip.status === "settled" && trip.cashExpected !== null ? trip.cashExpected : money.cashExpected)} strong />
        <Row label={t("UPI to check")} value={formatMoney(trip.status === "settled" && trip.upiExpected !== null ? trip.upiExpected : money.upiExpected)} />
      </div>
      <p className="mt-1 text-[11px] text-muted">{t("Old dues count when the trip's salesman records them while the van is out.")}</p>
    </section>
  );
}

function BackButton({ tripId, fix }: { tripId: string; fix: Fix | null }) {
  const { t } = useT();
  const { run, pending, error } = useRun();
  return (
    <div className="flex flex-col gap-2">
      <ErrorNote error={error} />
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t("The van is back? No more bills can be made on this trip."))) return;
          pingEnd(tripId, fix);
          run(() => returnTripAction(tripId));
        }}
        className="rounded-lg border border-border px-3 py-2.5 text-sm font-semibold text-foreground disabled:opacity-60"
      >
        {t("The van is back")}
      </button>
    </div>
  );
}

function CancelButton({ tripId }: { tripId: string }) {
  const { t } = useT();
  const { run, pending, error } = useRun();
  return (
    <div className="flex flex-col gap-2">
      <ErrorNote error={error} />
      <button type="button" disabled={pending} onClick={() => window.confirm(t("Cancel this trip? Nothing was loaded.")) && run(() => cancelTripAction(tripId))} className="text-sm font-medium text-danger underline disabled:opacity-60">
        {t("Cancel trip")}
      </button>
    </div>
  );
}

function Settle({ tripId, items, money }: { tripId: string; items: TripItem[]; money: Money }) {
  const { t } = useT();
  const { run, pending, error } = useRun();
  const onVan = items.filter((i) => i.onVan > 0);
  const [count, setCount] = useState<Record<string, { counted: string; damaged: string }>>(() => Object.fromEntries(onVan.map((i) => [i.productId, { counted: String(i.onVan), damaged: "0" }])));
  const [cash, setCash] = useState(String(money.cashExpected));
  const [upi, setUpi] = useState(String(money.upiExpected));
  const [charge, setCharge] = useState(true);
  const [note, setNote] = useState("");
  const result = useMemo(
    () => countResult(onVan.map((i) => ({ productId: i.productId, name: i.name, expected: i.onVan, counted: Number(count[i.productId]?.counted) || 0, damaged: Number(count[i.productId]?.damaged) || 0, price: i.price }))),
    [onVan, count],
  );
  const cashDiff = cashDifference(money.cashExpected, Number(cash) || 0);
  const set = (id: string, k: "counted" | "damaged", v: string) => setCount((c) => ({ ...c, [id]: { ...c[id], [k]: v } }));

  return (
    <section className="neu-card flex flex-col gap-3 border-2 border-brand/30 p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("Settle the trip")}</h2>
        <p className="text-xs text-muted">{t("Count what came back. Good pieces go to the godown, broken ones to damaged stock, and what is missing is written off.")}</p>
      </div>
      {onVan.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[340px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-medium">{t("Item")}</th>
                <th className="py-1 text-right font-medium">{t("Should be")}</th>
                <th className="py-1 text-right font-medium">{t("Good back")}</th>
                <th className="py-1 text-right font-medium">{t("Broken")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.lines.map((l) => (
                <tr key={l.productId}>
                  <td className="py-1.5 pr-2 text-foreground">
                    {l.name}
                    {l.shortage > 0 && <span className="block text-[11px] text-danger">{t("Missing")} {q(l.shortage)} · {formatMoney(l.shortageValue)}</span>}
                    {l.excess > 0 && <span className="block text-[11px] text-warning">{t("Extra")} {q(l.excess)}</span>}
                  </td>
                  <td className="py-1.5 text-right text-muted">{q(l.expected)}</td>
                  <td className="py-1.5 text-right">
                    <input type="number" inputMode="decimal" min={0} step="any" value={count[l.productId]?.counted ?? ""} onChange={(e) => set(l.productId, "counted", e.target.value)} aria-label={`${t("Good back")} — ${l.name}`} className="w-20 rounded-lg px-2 py-1 text-right text-sm" />
                  </td>
                  <td className="py-1.5 text-right">
                    <input type="number" inputMode="decimal" min={0} step="any" value={count[l.productId]?.damaged ?? ""} onChange={(e) => set(l.productId, "damaged", e.target.value)} aria-label={`${t("Broken")} — ${l.name}`} className="w-16 rounded-lg px-2 py-1 text-right text-sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t("Cash handed over (₹)")}
          <input type="number" inputMode="decimal" min={0} value={cash} onChange={(e) => setCash(e.target.value)} className="rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t("UPI received (₹)")}
          <input type="number" inputMode="decimal" min={0} value={upi} onChange={(e) => setUpi(e.target.value)} className="rounded-lg px-3 py-2 text-sm" />
        </label>
      </div>
      <div className="flex flex-col gap-0.5 rounded-lg bg-surface-2 px-3 py-2 text-sm">
        <Row label={t("Cash expected")} value={formatMoney(money.cashExpected)} />
        <Row label={cashDiff < 0 ? t("Cash short") : cashDiff > 0 ? t("Cash over") : t("Cash matches")} value={formatMoney(Math.abs(cashDiff))} strong={cashDiff !== 0} />
        <Row label={t("Missing stock (at selling price)")} value={formatMoney(result.shortageValue)} strong={result.shortageValue > 0} />
        {result.damaged > 0 && <Row label={t("Broken pieces")} value={q(result.damaged)} />}
      </div>
      {(cashDiff < 0 || result.shortageValue > 0) && (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={charge} onChange={(e) => setCharge(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          {t("Charge the shortage to the salesman ({amount})", { amount: formatMoney(Math.max(0, -cashDiff) + result.shortageValue) })}
        </label>
      )}
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Note (reason for any difference)")} className="rounded-lg px-3 py-2 text-sm" />
      <ErrorNote error={error} />
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t("Settle this trip? Stock goes back to the godown and the trip is locked."))) return;
          run(() => settleTripAction(tripId, { lines: result.lines.map((l) => ({ productId: l.productId, counted: l.counted, damaged: l.damaged })), cashHanded: Number(cash) || 0, upiReceived: Number(upi) || 0, chargeSalesman: charge, note }));
        }}
        className="btn-primary disabled:opacity-60"
      >
        {pending ? t("Settling…") : t("Settle trip")}
      </button>
    </section>
  );
}

function Settled({ counts, trip }: { counts: TripCount[]; trip: TripRow }) {
  const { t } = useT();
  const cashDiff = trip.cashExpected !== null && trip.cashHanded !== null ? cashDifference(trip.cashExpected, trip.cashHanded) : 0;
  return (
    <section className="neu-card flex flex-col gap-2 p-4">
      <h2 className="text-sm font-semibold text-foreground">{t("Settlement")}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 font-medium">{t("Item")}</th>
              <th className="py-1 text-right font-medium">{t("Loaded")}</th>
              <th className="py-1 text-right font-medium">{t("Sold")}</th>
              <th className="py-1 text-right font-medium">{t("Back")}</th>
              <th className="py-1 text-right font-medium">{t("Broken")}</th>
              <th className="py-1 text-right font-medium">{t("Missing")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {counts.map((c) => (
              <tr key={c.productId}>
                <td className="py-1.5 pr-2 text-foreground">{c.name}</td>
                <td className="py-1.5 text-right text-muted">{q(c.loaded)}</td>
                <td className="py-1.5 text-right text-muted">{q(c.sold)}</td>
                <td className="py-1.5 text-right text-foreground">{q(c.counted)}</td>
                <td className="py-1.5 text-right text-muted">{q(c.damaged)}</td>
                <td className={`py-1.5 text-right ${c.shortage > 0 ? "font-semibold text-danger" : "text-muted"}`}>{c.excess > 0 ? `+${q(c.excess)}` : q(c.shortage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-0.5 text-sm">
        <Row label={t("Cash expected")} value={formatMoney(trip.cashExpected ?? 0)} />
        <Row label={t("Cash handed over")} value={formatMoney(trip.cashHanded ?? 0)} />
        {cashDiff !== 0 && <Row label={cashDiff < 0 ? t("Cash short") : t("Cash over")} value={formatMoney(Math.abs(cashDiff))} strong />}
        <Row label={t("UPI expected / received")} value={`${formatMoney(trip.upiExpected ?? 0)} / ${formatMoney(trip.upiReceived ?? 0)}`} />
        {(trip.shortageValue ?? 0) > 0 && <Row label={t("Missing stock")} value={formatMoney(trip.shortageValue ?? 0)} />}
        {trip.salesmanCharge > 0 && <Row label={t("Charged to the salesman")} value={formatMoney(trip.salesmanCharge)} strong />}
        {trip.settleNote && <p className="text-xs text-muted">{trip.settleNote}</p>}
      </div>
    </section>
  );
}
