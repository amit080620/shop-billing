"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "@/lib/link";
import { useRouter } from "next/navigation";
import { Plus, Settings2 } from "lucide-react";
import { addEventPaymentAction, cancelEventAction, invoiceEventAction, saveEventAction, saveHallAction, type EventInput } from "@/lib/actions/hotel-ops";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/hotel/constants";
import { formatStayDateLong } from "@/lib/hotel/dates";
import { eventAmounts, eventsClash, SESSIONS, SESSION_LABEL, type EventSession } from "@/lib/hotel/events";
import type { EventRow, Hall } from "@/lib/hotel/ops";
import { formatMoney, paymentMethodLabel } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";
import { useToast } from "@/app/components/Toast";
import { Sheet } from "../Sheet";
import { HOTEL_INPUT, HOTEL_LABEL } from "../ui";

const STATUS: Record<EventRow["status"], { label: string; cls: string }> = {
  enquiry: { label: "Enquiry", cls: "bg-surface-2 text-muted" },
  confirmed: { label: "Confirmed", cls: "bg-brand-soft text-brand-text" },
  completed: { label: "Invoiced", cls: "bg-success-soft text-success" },
  cancelled: { label: "Cancelled", cls: "bg-danger-soft text-danger" },
};

const amountsOf = (e: EventRow, composition: boolean) => eventAmounts({ hallRent: e.hallRent, plates: e.plates, plateRate: e.plateRate, decoration: e.decoration, otherAmount: e.otherAmount, otherLabel: e.otherLabel, gstPercent: composition ? 0 : e.gstPercent, eventName: e.eventName });

export function EventsClient({ halls, events, today, canManage, composition }: { halls: Hall[]; events: EventRow[]; today: string; canManage: boolean; composition: boolean }) {
  const { t } = useT();
  const [editing, setEditing] = useState<EventRow | "new" | null>(null);
  const [open, setOpen] = useState<EventRow | null>(null);
  const [hallSheet, setHallSheet] = useState(false);
  const [past, setPast] = useState(false);
  const shown = useMemo(() => (past ? [...events].reverse().filter((e) => e.eventDate < today) : events.filter((e) => e.eventDate >= today)).filter((e) => past || e.status !== "cancelled"), [events, past, today]);
  const openEvent = open ? events.find((e) => e.id === open.id) ?? open : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setEditing("new")} className="btn-primary-sm flex items-center gap-1">
          <Plus size={14} /> {t("New event")}
        </button>
        {canManage && (
          <button type="button" onClick={() => setHallSheet(true)} className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground">
            <Settings2 size={13} /> {t("Halls")} ({halls.length})
          </button>
        )}
        <button type="button" onClick={() => setPast((v) => !v)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${past ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
          {t("Past events")}
        </button>
      </div>

      {shown.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{past ? t("No past events.") : t("No events coming up.")}</p>}
      <ul className="flex flex-col gap-2 md:grid md:grid-cols-2">
        {shown.map((e) => {
          const a = amountsOf(e, composition);
          return (
            <li key={e.id}>
              <button type="button" onClick={() => setOpen(e)} className="neu-card flex w-full flex-col gap-1 p-3 text-left">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-words text-sm font-semibold text-foreground">{e.eventName}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[e.status].cls}`}>{t(STATUS[e.status].label)}</span>
                </span>
                <span className="break-words text-xs text-muted">
                  {formatStayDateLong(e.eventDate)} · {t(SESSION_LABEL[e.session])}
                  {e.hallName ? ` · ${e.hallName}` : ""}
                  {e.guests ? ` · ${e.guests} ${t("guests")}` : ""}
                </span>
                <span className="text-xs text-foreground">
                  {t("Total")} {formatMoney(a.total)} · {t("Received")} {formatMoney(e.received)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {openEvent && <EventSheet event={openEvent} composition={composition} canManage={canManage} onEdit={() => { setEditing(openEvent); setOpen(null); }} onClose={() => setOpen(null)} />}
      {editing && <EventForm event={editing === "new" ? null : editing} halls={halls} events={events} today={today} composition={composition} onClose={() => setEditing(null)} />}
      {hallSheet && <HallsSheet halls={halls} onClose={() => setHallSheet(false)} />}
    </div>
  );
}

function EventSheet({ event: e, composition, canManage, onEdit, onClose }: { event: EventRow; composition: boolean; canManage: boolean; onEdit: () => void; onClose: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [billId, setBillId] = useState(e.billId);
  const a = amountsOf(e, composition);
  const balance = Math.max(0, Math.round((a.total - e.received) * 100) / 100);
  const live = e.status === "enquiry" || e.status === "confirmed";

  function pay(kind: "advance" | "refund") {
    setError(null);
    startTransition(async () => {
      const r = await addEventPaymentAction({ eventId: e.id, kind, amount: Number(amount), method, reference });
      if (r.error) return setError(r.error);
      showToast(kind === "refund" ? t("Refund recorded") : t("Payment recorded"));
      setAmount("");
      setReference("");
      router.refresh();
    });
  }
  function invoice() {
    if (!confirm(t("Make the GST invoice for this event? It can't be changed after that."))) return;
    setError(null);
    startTransition(async () => {
      const r = await invoiceEventAction(e.id);
      if (r.error) return setError(r.error);
      showToast(t("Invoice made"));
      setBillId(r.billId ?? null);
      router.refresh();
    });
  }
  function cancel() {
    if (!confirm(t("Cancel this event? Any advance stays recorded until you refund it."))) return;
    startTransition(async () => {
      const r = await cancelEventAction(e.id);
      if (r.error) return setError(r.error);
      onClose();
      router.refresh();
    });
  }

  return (
    <Sheet title={e.eventName} onClose={onClose} wide>
      <p className="break-words text-xs text-muted">
        {e.eventNumber} · {formatStayDateLong(e.eventDate)} · {t(SESSION_LABEL[e.session])}
        {e.hallName ? ` · ${e.hallName}` : ""}
      </p>
      <p className="break-words text-sm text-foreground">
        {e.clientName}
        {e.clientPhone && (
          <a href={`tel:${e.clientPhone}`} className="ml-2 font-semibold text-brand-text">
            {e.clientPhone}
          </a>
        )}
      </p>
      {e.menu && <p className="whitespace-pre-line break-words rounded-lg bg-surface-2 px-3 py-2 text-xs text-foreground">{e.menu}</p>}
      <div className="flex flex-col gap-1 rounded-xl border border-border p-3 text-sm">
        <Row label={t("Before tax")} value={formatMoney(a.taxable)} />
        {a.gst > 0 && <Row label={`GST ${e.gstPercent}%`} value={formatMoney(a.gst)} />}
        <Row label={t("Total")} value={formatMoney(a.total)} bold />
        <Row label={t("Received")} value={formatMoney(e.received)} />
        <Row label={t("Balance")} value={formatMoney(balance)} bold />
      </div>

      {live && (
        <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <p className="text-xs font-semibold text-foreground">{t("Take money")}</p>
          <input type="number" inputMode="decimal" min={0} value={amount} onChange={(x) => setAmount(x.target.value)} placeholder={t("Amount (₹)")} className={HOTEL_INPUT} />
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <button key={m} type="button" onClick={() => setMethod(m)} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${method === m ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
                {t(paymentMethodLabel(m))}
              </button>
            ))}
          </div>
          <input value={reference} onChange={(x) => setReference(x.target.value)} placeholder={t("UPI ref / receipt no.")} className={HOTEL_INPUT} />
          <div className="flex gap-2">
            <button type="button" disabled={isPending} onClick={() => pay("advance")} className="flex-1 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {t("Record advance")}
            </button>
            {canManage && e.received > 0 && (
              <button type="button" disabled={isPending} onClick={() => pay("refund")} className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-60">
                {t("Give back")}
              </button>
            )}
          </div>
        </div>
      )}
      {error && <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {billId ? (
        <Link href={`/print/bill/${billId}`} className="btn-primary text-center">
          {t("Open invoice")}
        </Link>
      ) : (
        live && (
          <>
            <button type="button" disabled={isPending} onClick={invoice} className="btn-primary disabled:opacity-60">
              {t("Make GST invoice")}
            </button>
            <button type="button" onClick={onEdit} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground">
              {t("Edit event")}
            </button>
            <button type="button" disabled={isPending} onClick={cancel} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-danger disabled:opacity-60">
              {t("Cancel event")}
            </button>
          </>
        )
      )}
    </Sheet>
  );
}

function EventForm({ event: e, halls, events, today, composition, onClose }: { event: EventRow | null; halls: Hall[]; events: EventRow[]; today: string; composition: boolean; onClose: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    hallId: e?.hallId ?? "",
    eventName: e?.eventName ?? "",
    clientName: e?.clientName ?? "",
    clientPhone: e?.clientPhone ?? "",
    companyName: e?.companyName ?? "",
    companyGstin: e?.companyGstin ?? "",
    companyAddress: e?.companyAddress ?? "",
    eventDate: e?.eventDate ?? today,
    session: (e?.session ?? "evening") as EventSession,
    guests: e ? String(e.guests) : "",
    hallRent: e ? String(e.hallRent) : "",
    plateRate: e ? String(e.plateRate) : "",
    plates: e ? String(e.plates) : "",
    decoration: e ? String(e.decoration) : "",
    otherAmount: e ? String(e.otherAmount) : "",
    otherLabel: e?.otherLabel ?? "",
    gstPercent: e ? String(e.gstPercent) : "18",
    menu: e?.menu ?? "",
    note: e?.note ?? "",
    status: (e?.status === "confirmed" ? "confirmed" : "enquiry") as "enquiry" | "confirmed",
  });
  const up = (key: keyof typeof f) => (x: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [key]: x.target.value }));
  const amounts = eventAmounts({ hallRent: Number(f.hallRent) || 0, plates: Number(f.plates) || 0, plateRate: Number(f.plateRate) || 0, decoration: Number(f.decoration) || 0, otherAmount: Number(f.otherAmount) || 0, otherLabel: f.otherLabel, gstPercent: composition ? 0 : Number(f.gstPercent) || 0, eventName: f.eventName });
  const clash = f.hallId ? events.find((x) => x.id !== e?.id && x.hallId === f.hallId && x.eventDate === f.eventDate && (x.status === "confirmed" || x.status === "completed") && eventsClash(x.session, f.session)) : undefined;

  function save() {
    setError(null);
    const input: EventInput = { ...f, hallId: f.hallId || null, guests: Number(f.guests) || 0, hallRent: Number(f.hallRent) || 0, plateRate: Number(f.plateRate) || 0, plates: Number(f.plates) || 0, decoration: Number(f.decoration) || 0, otherAmount: Number(f.otherAmount) || 0, gstPercent: Number(f.gstPercent) || 0 };
    startTransition(async () => {
      const r = await saveEventAction(e?.id ?? null, input);
      if (r.error) return setError(r.error);
      showToast(t("Event saved"));
      onClose();
      router.refresh();
    });
  }

  return (
    <Sheet title={e ? t("Edit event") : t("New event")} onClose={onClose} wide>
      <label className={HOTEL_LABEL}>
        {t("Event")}
        <input value={f.eventName} onChange={up("eventName")} placeholder={t("e.g. Sharma wedding reception")} className={HOTEL_INPUT} autoFocus={!e} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={HOTEL_LABEL}>
          {t("Date")}
          <input type="date" value={f.eventDate} onChange={up("eventDate")} className={HOTEL_INPUT} />
        </label>
        <label className={HOTEL_LABEL}>
          {t("Session")}
          <select value={f.session} onChange={up("session")} className={HOTEL_INPUT}>
            {SESSIONS.map((s) => (
              <option key={s} value={s}>
                {t(SESSION_LABEL[s])}
              </option>
            ))}
          </select>
        </label>
        <label className={HOTEL_LABEL}>
          {t("Hall")}
          <select
            value={f.hallId}
            onChange={(x) => {
              const hall = halls.find((h) => h.id === x.target.value);
              setF((p) => ({ ...p, hallId: x.target.value, hallRent: hall && !p.hallRent ? String(hall.rate) : p.hallRent }));
            }}
            className={HOTEL_INPUT}
          >
            <option value="">{t("No hall")}</option>
            {halls.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
                {h.capacity ? ` (${h.capacity})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className={HOTEL_LABEL}>
          {t("Guests")}
          <input type="number" inputMode="numeric" min={0} value={f.guests} onChange={up("guests")} className={HOTEL_INPUT} />
        </label>
      </div>
      {clash && <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-foreground">{t("This hall is already booked for \"{name}\" in that session.", { name: clash.eventName })}</p>}
      <div className="grid grid-cols-2 gap-3">
        <label className={HOTEL_LABEL}>
          {t("Client's name")}
          <input value={f.clientName} onChange={up("clientName")} className={HOTEL_INPUT} />
        </label>
        <label className={HOTEL_LABEL}>
          {t("Mobile number")}
          <input type="tel" value={f.clientPhone} onChange={up("clientPhone")} className={HOTEL_INPUT} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className={HOTEL_LABEL}>
          {t("Hall rent (₹)")}
          <input type="number" inputMode="decimal" min={0} value={f.hallRent} onChange={up("hallRent")} className={HOTEL_INPUT} />
        </label>
        <label className={HOTEL_LABEL}>
          {t("Decoration (₹)")}
          <input type="number" inputMode="decimal" min={0} value={f.decoration} onChange={up("decoration")} className={HOTEL_INPUT} />
        </label>
        <label className={HOTEL_LABEL}>
          {t("Plates")}
          <input type="number" inputMode="numeric" min={0} value={f.plates} onChange={up("plates")} className={HOTEL_INPUT} />
        </label>
        <label className={HOTEL_LABEL}>
          {t("Rate per plate (₹)")}
          <input type="number" inputMode="decimal" min={0} value={f.plateRate} onChange={up("plateRate")} className={HOTEL_INPUT} />
        </label>
        <label className={HOTEL_LABEL}>
          {t("Other charges (₹)")}
          <input type="number" inputMode="decimal" min={0} value={f.otherAmount} onChange={up("otherAmount")} className={HOTEL_INPUT} />
        </label>
        <label className={HOTEL_LABEL}>
          {t("For what?")}
          <input value={f.otherLabel} onChange={up("otherLabel")} placeholder={t("e.g. DJ")} className={HOTEL_INPUT} />
        </label>
      </div>
      {!composition && (
        <label className={HOTEL_LABEL}>
          {t("GST %")}
          <select value={f.gstPercent} onChange={up("gstPercent")} className={HOTEL_INPUT}>
            {[0, 5, 12, 18, 28].map((g) => (
              <option key={g} value={g}>
                {g}%
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={HOTEL_LABEL}>
        {t("Menu and arrangements (optional)")}
        <textarea rows={3} value={f.menu} onChange={up("menu")} className={HOTEL_INPUT} />
      </label>
      <details className="rounded-xl border border-border p-3">
        <summary className="cursor-pointer text-xs font-semibold text-foreground">{t("Company GST invoice (optional)")}</summary>
        <div className="mt-2 flex flex-col gap-2">
          <input value={f.companyName} onChange={up("companyName")} placeholder={t("Company name (as registered)")} className={HOTEL_INPUT} />
          <input value={f.companyGstin} onChange={(x) => setF((p) => ({ ...p, companyGstin: x.target.value.toUpperCase().slice(0, 15) }))} placeholder="GSTIN — 27ABCDE1234F1Z5" className={HOTEL_INPUT} />
          <input value={f.companyAddress} onChange={up("companyAddress")} placeholder={t("Company address (optional)")} className={HOTEL_INPUT} />
        </div>
      </details>
      <div className="grid grid-cols-2 gap-2">
        {(["enquiry", "confirmed"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setF((p) => ({ ...p, status: s }))} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${f.status === s ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
            {t(STATUS[s].label)}
          </button>
        ))}
      </div>
      <p className="text-sm font-semibold text-foreground">
        {t("Total")} {formatMoney(amounts.total)} <span className="text-xs font-normal text-muted">({formatMoney(amounts.taxable)} {t("before tax")})</span>
      </p>
      {error && <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <button type="button" disabled={isPending} onClick={save} className="btn-primary disabled:opacity-60">
        {isPending ? t("Saving…") : t("Save event")}
      </button>
    </Sheet>
  );
}

function HallsSheet({ halls, onClose }: { halls: Hall[]; onClose: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [rate, setRate] = useState("");

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await saveHallAction(id, { name, capacity: capacity === "" ? null : Number(capacity), rate: Number(rate) || 0 });
      if (r.error) return setError(r.error);
      setId(null);
      setName("");
      setCapacity("");
      setRate("");
      router.refresh();
    });
  }

  return (
    <Sheet title={t("Halls")} onClose={onClose}>
      {halls.length > 0 && (
        <ul className="flex flex-col divide-y divide-border">
          {halls.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => {
                  setId(h.id);
                  setName(h.name);
                  setCapacity(h.capacity === null ? "" : String(h.capacity));
                  setRate(String(h.rate));
                }}
                className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm"
              >
                <span className="min-w-0 break-words font-medium text-foreground">{h.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {h.capacity ? `${h.capacity} ${t("guests")} · ` : ""}
                  {formatMoney(h.rate)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className={HOTEL_LABEL}>
        {t("Hall's name")}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Crystal Hall")} className={HOTEL_INPUT} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={HOTEL_LABEL}>
          {t("Capacity")}
          <input type="number" inputMode="numeric" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={HOTEL_INPUT} />
        </label>
        <label className={HOTEL_LABEL}>
          {t("Usual rent (₹)")}
          <input type="number" inputMode="decimal" min={0} value={rate} onChange={(e) => setRate(e.target.value)} className={HOTEL_INPUT} />
        </label>
      </div>
      {error && <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <button type="button" disabled={isPending} onClick={save} className="btn-primary disabled:opacity-60">
        {isPending ? t("Saving…") : id ? t("Save hall") : t("Add hall")}
      </button>
    </Sheet>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-semibold text-foreground" : ""}`}>
      <span className={bold ? "" : "text-muted"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
