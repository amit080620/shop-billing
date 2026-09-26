"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import { createBookingAction, getAvailabilityAction } from "@/lib/actions/hotel";
import { lookupCustomerByPhoneAction } from "@/lib/actions/customers";
import { BOOKING_SOURCES, MEAL_PLANS, PAYMENT_METHODS, sourceIsOta, sourceTakesCommission, type MealPlan, type PaymentMethod } from "@/lib/hotel/constants";
import { addDays, isIsoDate, nightsBetween } from "@/lib/hotel/dates";
import { computeFolio } from "@/lib/hotel/folio";
import { roomGstPercent } from "@/lib/hotel/gst";
import { formatMoney, paymentMethodLabel } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";
import { useToast } from "@/app/components/Toast";
import { HOTEL_INPUT, HOTEL_LABEL } from "../../ui";

type AvailType = { id: string; name: string; baseRate: number; gstPercent: number | null; maxAdults: number; available: number; total: number; freeRooms: { id: string; roomNumber: string }[] };
type Line = { key: string; roomTypeId: string; roomId: string; rate: string };

let lineSeq = 0;

export function NewBookingClient({ today, initialCheckIn, presetRoom }: { today: string; initialCheckIn: string; presetRoom: { id: string; roomTypeId: string } | null }) {
  const { t } = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(addDays(initialCheckIn, 1));
  const [avail, setAvail] = useState<AvailType[] | null>(null);
  const [availError, setAvailError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [presetApplied, setPresetApplied] = useState(false);

  const [guestName, setGuestName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [source, setSource] = useState("walk_in");
  const [sourceRef, setSourceRef] = useState("");
  const [agentName, setAgentName] = useState("");
  const [commission, setCommission] = useState("");
  const [mealPlan, setMealPlan] = useState<MealPlan>("EP");
  const [advance, setAdvance] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState<PaymentMethod>("cash");
  const [advanceRef, setAdvanceRef] = useState("");
  const [requests, setRequests] = useState("");
  const [error, setError] = useState<string | null>(null);

  const datesOk = isIsoDate(checkIn) && isIsoDate(checkOut) && checkOut > checkIn;
  const nights = datesOk ? nightsBetween(checkIn, checkOut) : 0;

  useEffect(() => {
    if (!datesOk) return;
    let cancelled = false;
    setAvailError(null);
    const timer = setTimeout(async () => {
      const r = await getAvailabilityAction({ checkIn, checkOut });
      if (cancelled) return;
      if ("error" in r && r.error) {
        setAvailError(r.error);
        return;
      }
      if ("types" in r && r.types) setAvail(r.types as AvailType[]);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [checkIn, checkOut, datesOk]);

  // Arriving from a room tile or a calendar cell: start with that room chosen.
  useEffect(() => {
    if (presetApplied || !presetRoom || !avail) return;
    const type = avail.find((a) => a.id === presetRoom.roomTypeId);
    if (type && type.freeRooms.some((r) => r.id === presetRoom.id)) {
      setLines([{ key: `l${++lineSeq}`, roomTypeId: type.id, roomId: presetRoom.id, rate: String(type.baseRate) }]);
    }
    setPresetApplied(true);
  }, [avail, presetApplied, presetRoom]);

  // A returning guest: fill in the name from the phone number.
  useEffect(() => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10 || guestName.trim()) return;
    let cancelled = false;
    lookupCustomerByPhoneAction(digits).then((r) => {
      if (!cancelled && r.name) setGuestName((cur) => cur || (r.name as string));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  function addLine(type: AvailType) {
    setLines((prev) => [...prev, { key: `l${++lineSeq}`, roomTypeId: type.id, roomId: "", rate: String(type.baseRate) }]);
  }
  function removeLastOf(typeId: string) {
    setLines((prev) => {
      const idx = [...prev].reverse().findIndex((l) => l.roomTypeId === typeId);
      if (idx < 0) return prev;
      const real = prev.length - 1 - idx;
      return prev.filter((_, i) => i !== real);
    });
  }
  function patchLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const typeById = useMemo(() => new Map((avail ?? []).map((a) => [a.id, a])), [avail]);

  const preview = useMemo(() => {
    if (!datesOk || lines.length === 0) return null;
    return computeFolio({
      rooms: lines.map((l, i) => {
        const type = typeById.get(l.roomTypeId);
        const rate = Number(l.rate) || 0;
        return { id: l.key, label: `Room ${i + 1}`, roomTypeName: type?.name ?? "Room", nights, ratePerNight: rate, gstPercent: roomGstPercent(rate, type?.gstPercent) };
      }),
      charges: [],
      roomService: [],
      payments: [],
    });
  }, [datesOk, lines, nights, typeById]);

  const capacity = lines.reduce((s, l) => s + (typeById.get(l.roomTypeId)?.maxAdults ?? 0), 0);
  const advanceNumber = Number(advance) || 0;

  function submit() {
    setError(null);
    if (!datesOk) return setError(t("Choose the check-in and check-out dates"));
    if (lines.length === 0) return setError(t("Pick at least one room"));
    startTransition(async () => {
      const r = await createBookingAction({
        guestName,
        guestPhone: phone,
        guestEmail: email,
        adults,
        children,
        source,
        sourceRef,
        agentName,
        commissionPercent: sourceTakesCommission(source) ? Number(commission) || 0 : 0,
        mealPlan,
        checkIn,
        checkOut,
        specialRequests: requests,
        rooms: lines.map((l) => ({ roomTypeId: l.roomTypeId, roomId: l.roomId || null, ratePerNight: Number(l.rate) })),
        advanceAmount: advanceNumber > 0 ? advanceNumber : undefined,
        advanceMethod,
        advanceReference: advanceRef,
      });
      if (r.error) return setError(r.error);
      showToast(t("Booking saved"));
      router.push(`/hotel/bookings/${r.bookingId}`);
    });
  }

  const takesCommission = sourceTakesCommission(source);
  const isOta = sourceIsOta(source);

  return (
    <div className="flex flex-col gap-5 pb-28">
      <section className="neu-card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("Stay dates")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className={HOTEL_LABEL}>
            {t("Check-in")}
            <input
              type="date"
              min={today}
              value={checkIn}
              onChange={(e) => {
                const v = e.target.value;
                setCheckIn(v);
                if (isIsoDate(v) && (!isIsoDate(checkOut) || checkOut <= v)) setCheckOut(addDays(v, 1));
              }}
              className={HOTEL_INPUT}
            />
          </label>
          <label className={HOTEL_LABEL}>
            {t("Check-out")}
            <input type="date" min={isIsoDate(checkIn) ? addDays(checkIn, 1) : today} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={HOTEL_INPUT} />
          </label>
        </div>
        {datesOk && (
          <p className="text-xs text-muted">
            {nights} {nights === 1 ? t("night") : t("nights")}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("Rooms")}</h2>
        {availError && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{availError}</p>}
        {!avail && datesOk && <p className="text-xs text-muted">{t("Checking availability…")}</p>}
        {avail && avail.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted">{t("No room types yet — add them under Set-up first.")}</p>}
        <ul className="flex flex-col gap-2">
          {(avail ?? []).map((a) => {
            const count = lines.filter((l) => l.roomTypeId === a.id).length;
            return (
              <li key={a.id} className="neu-card flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{a.name}</p>
                  <p className="text-xs text-muted">
                    {formatMoney(a.baseRate)} / {t("night")} ·{" "}
                    <span className={a.available === 0 ? "font-medium text-danger" : "font-medium text-success"}>
                      {a.available} {t("free")}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => removeLastOf(a.id)} disabled={count === 0} aria-label={t("Fewer")} className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground disabled:opacity-30">
                    <Minus size={15} />
                  </button>
                  <span className="w-5 text-center text-sm font-semibold text-foreground">{count}</span>
                  <button type="button" onClick={() => addLine(a)} disabled={count >= a.available} aria-label={t("More")} className="flex h-8 w-8 items-center justify-center rounded-full border border-brand bg-brand-soft text-brand-text disabled:opacity-30">
                    <Plus size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {lines.length > 0 && (
          <ul className="flex flex-col gap-2">
            {lines.map((l, i) => {
              const type = typeById.get(l.roomTypeId);
              const taken = new Set(lines.filter((x) => x.key !== l.key && x.roomId).map((x) => x.roomId));
              return (
                <li key={l.key} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">
                      {t("Room")} {i + 1} · {type?.name}
                    </p>
                    <button type="button" onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))} aria-label={t("Remove")} className="rounded-full p-1.5 text-muted hover:bg-surface-2">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={HOTEL_LABEL}>
                      {t("Room number")}
                      <select value={l.roomId} onChange={(e) => patchLine(l.key, { roomId: e.target.value })} className={HOTEL_INPUT}>
                        <option value="">{t("Assign at check-in")}</option>
                        {(type?.freeRooms ?? []).filter((r) => !taken.has(r.id)).map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.roomNumber}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={HOTEL_LABEL}>
                      {t("Rate / night (₹)")}
                      <input type="number" inputMode="decimal" min={0} value={l.rate} onChange={(e) => patchLine(l.key, { rate: e.target.value })} className={HOTEL_INPUT} />
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="neu-card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("Guest")}</h2>
        <label className={HOTEL_LABEL}>
          {t("Mobile number")}
          <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" className={HOTEL_INPUT} />
        </label>
        <label className={HOTEL_LABEL}>
          {t("Guest name")}
          <input value={guestName} onChange={(e) => setGuestName(e.target.value)} className={HOTEL_INPUT} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Stepper label={t("Adults")} value={adults} min={1} onChange={setAdults} />
          <Stepper label={t("Children")} value={children} min={0} onChange={setChildren} />
        </div>
        {capacity > 0 && adults > capacity && <p className="text-xs text-warning">{t("More adults than these rooms are meant for — you may want another room.")}</p>}
        <label className={HOTEL_LABEL}>
          {t("Email (optional)")}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={HOTEL_INPUT} />
        </label>
      </section>

      <section className="neu-card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("Where did this booking come from?")}</h2>
        <div className="flex flex-wrap gap-2">
          {BOOKING_SOURCES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSource(s.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${source === s.value ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}
            >
              {t(s.label)}
            </button>
          ))}
        </div>
        {isOta && (
          <label className={HOTEL_LABEL}>
            {t("Booking ID from the app / website")}
            <input value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} placeholder="e.g. NH1234567" className={HOTEL_INPUT} />
          </label>
        )}
        {source === "agent" && (
          <label className={HOTEL_LABEL}>
            {t("Agent / broker name")}
            <input value={agentName} onChange={(e) => setAgentName(e.target.value)} className={HOTEL_INPUT} />
          </label>
        )}
        {takesCommission && (
          <label className={HOTEL_LABEL}>
            {t("Their commission (%)")}
            <input type="number" inputMode="decimal" min={0} max={100} value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="15" className={HOTEL_INPUT} />
            <span className="font-normal">{t("Kept for your reports — it doesn't change the guest's bill.")}</span>
          </label>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">{t("Meal plan")}</span>
          <div className="flex flex-wrap gap-2">
            {MEAL_PLANS.map((m) => (
              <button key={m.value} type="button" onClick={() => setMealPlan(m.value)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${mealPlan === m.value ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
                {m.short} · {t(m.label)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="neu-card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("Advance received (optional)")}</h2>
        <label className={HOTEL_LABEL}>
          {t("Amount (₹)")}
          <input type="number" inputMode="decimal" min={0} value={advance} onChange={(e) => setAdvance(e.target.value)} className={HOTEL_INPUT} />
        </label>
        {advanceNumber > 0 && (
          <>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button key={m} type="button" onClick={() => setAdvanceMethod(m)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${advanceMethod === m ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
                  {t(paymentMethodLabel(m))}
                </button>
              ))}
            </div>
            <label className={HOTEL_LABEL}>
              {t("Reference (optional)")}
              <input value={advanceRef} onChange={(e) => setAdvanceRef(e.target.value)} placeholder={t("UPI ref / receipt no.")} className={HOTEL_INPUT} />
            </label>
          </>
        )}
        <label className={HOTEL_LABEL}>
          {t("Special requests (optional)")}
          <textarea value={requests} onChange={(e) => setRequests(e.target.value)} rows={2} className={HOTEL_INPUT} />
        </label>
      </section>

      {error && (
        <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-[var(--bottom-nav-h,4rem)] z-30 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-72">
        <div className="mx-auto flex max-w-lg items-center gap-3 md:max-w-3xl">
          <div className="min-w-0 flex-1">
            {preview ? (
              <>
                <p className="text-xs text-muted">
                  {nights} {nights === 1 ? t("night") : t("nights")} · {lines.length} {lines.length === 1 ? t("room") : t("rooms")} · {t("incl. GST")}
                </p>
                <p className="text-lg font-bold leading-tight text-foreground">
                  {formatMoney(preview.invoiceTotal)}
                  {advanceNumber > 0 && <span className="ml-2 text-xs font-medium text-muted">{t("Due")} {formatMoney(Math.max(0, preview.invoiceTotal - advanceNumber))}</span>}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted">{t("Pick dates and rooms to see the total")}</p>
            )}
          </div>
          <button type="button" onClick={submit} disabled={isPending || !preview} className="btn-primary shrink-0 disabled:opacity-50">
            {isPending ? t("Saving…") : t("Save booking")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stepper({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (n: number) => void }) {
  return (
    <div className={HOTEL_LABEL}>
      {label}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`${label} −`} className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground">
          <Minus size={15} />
        </button>
        <span className="w-6 text-center text-base font-semibold text-foreground">{value}</span>
        <button type="button" onClick={() => onChange(value + 1)} aria-label={`${label} +`} className="flex h-9 w-9 items-center justify-center rounded-full border border-brand bg-brand-soft text-brand-text">
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}
