"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { BedDouble, CheckCircle2, Phone } from "lucide-react";
import { requestStayAction, stayQuoteAction } from "@/lib/actions/hotel-public";
import { addDays, isIsoDate, nightsBetween } from "@/lib/hotel/dates";
import type { StayOption } from "@/lib/hotel/publicStay";
import { formatMoney } from "@/lib/format";

const INPUT = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand";
const LABEL = "flex flex-col gap-1 text-xs font-medium text-muted";

export function StayClient({ token, name, logoUrl, city, phone, about, policies, today, tomorrow }: { token: string; name: string; logoUrl: string | null; city: string | null; phone: string | null; about: string | null; policies: string | null; today: string; tomorrow: string }) {
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(tomorrow);
  const [options, setOptions] = useState<StayOption[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [picked, setPicked] = useState<StayOption | null>(null);
  const [rooms, setRooms] = useState(1);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("0");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const datesOk = isIsoDate(checkIn) && isIsoDate(checkOut) && checkOut > checkIn;
  const nights = datesOk ? nightsBetween(checkIn, checkOut) : 0;

  useEffect(() => {
    setPicked(null);
    setRooms(1);
    if (!datesOk) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const r = await stayQuoteAction(token, checkIn, checkOut).catch(() => ({ error: "Could not reach the hotel. Check your internet and try again.", options: undefined }));
      if (cancelled) return;
      setProblem(r.error ?? null);
      setOptions(r.options ?? null);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, checkIn, checkOut, datesOk]);

  function send() {
    if (!picked) return;
    setError(null);
    startTransition(async () => {
      try {
        const r = await requestStayAction(token, { roomTypeId: picked.id, rooms, checkIn, checkOut, guestName, guestPhone, guestEmail, adults: Number(adults), children: Number(children), message, website });
        if (r.error) return setError(r.error);
        setSent(true);
      } catch {
        setError("Could not reach the hotel. Check your internet and try again.");
      }
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 bg-background px-4 py-6">
      <header className="flex flex-col items-center gap-2 text-center">
        {logoUrl ? (
          <Image src={logoUrl} alt="" width={64} height={64} className="h-16 w-16 rounded-full object-cover" unoptimized />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand-text">
            <BedDouble size={26} strokeWidth={1.6} />
          </span>
        )}
        <h1 className="text-xl font-bold text-foreground">{name}</h1>
        {city && <p className="text-sm text-muted">{city}</p>}
        {about && <p className="whitespace-pre-line text-sm text-foreground">{about}</p>}
      </header>

      {sent ? (
        <section className="neu-card flex flex-col items-center gap-2 p-6 text-center">
          <CheckCircle2 size={36} className="text-success" />
          <p className="text-base font-bold text-foreground">Request sent</p>
          <p className="text-sm text-muted">Your room isn&apos;t confirmed yet. {name} will call you on {guestPhone} to confirm it.</p>
          {phone && (
            <a href={`tel:${phone}`} className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-brand-text">
              <Phone size={15} /> {phone}
            </a>
          )}
        </section>
      ) : (
        <>
          <section className="neu-card grid grid-cols-2 gap-3 p-4">
            <label className={LABEL}>
              Check-in
              <input
                type="date"
                min={today}
                value={checkIn}
                onChange={(e) => {
                  setCheckIn(e.target.value);
                  if (isIsoDate(e.target.value) && checkOut <= e.target.value) setCheckOut(addDays(e.target.value, 1));
                }}
                className={INPUT}
              />
            </label>
            <label className={LABEL}>
              Check-out
              <input type="date" min={isIsoDate(checkIn) ? addDays(checkIn, 1) : tomorrow} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={INPUT} />
            </label>
            {datesOk && <p className="col-span-2 text-xs text-muted">{nights} {nights === 1 ? "night" : "nights"}</p>}
          </section>

          {problem && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{problem}</p>}
          {!options && !problem && datesOk && <p className="text-center text-xs text-muted">Checking rooms…</p>}
          {options?.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">No rooms for these dates. Please try other dates or call the hotel.</p>}

          <ul className="flex flex-col gap-2">
            {options?.map((o) => {
              const off = o.rooms === 0 || !!o.stopReason;
              return (
                <li key={o.id}>
                  <button type="button" disabled={off} onClick={() => setPicked(o)} className={`neu-card flex w-full flex-col gap-1 p-4 text-left disabled:opacity-60 ${picked?.id === o.id ? "ring-2 ring-brand" : ""}`}>
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0 break-words text-sm font-bold text-foreground">{o.name}</span>
                      <span className="shrink-0 text-right text-sm font-bold text-foreground">
                        {formatMoney(o.rate)}
                        <span className="block text-[11px] font-normal text-muted">a night, plus GST</span>
                      </span>
                    </span>
                    {o.description && <span className="break-words text-xs text-muted">{o.description}</span>}
                    {o.amenities && <span className="break-words text-xs text-muted">{o.amenities}</span>}
                    <span className="text-xs text-muted">Up to {o.maxAdults} adults{o.maxChildren ? ` and ${o.maxChildren} children` : ""}</span>
                    {o.rooms === 0 && <span className="text-xs font-semibold text-danger">Sold out for these dates</span>}
                    {o.stopReason && <span className="text-xs font-semibold text-warning">{o.stopReason}</span>}
                  </button>
                </li>
              );
            })}
          </ul>

          {picked && (
            <section className="neu-card flex flex-col gap-3 p-4">
              <h2 className="text-sm font-semibold text-foreground">Your details</h2>
              <label className={LABEL}>
                Rooms
                <select value={rooms} onChange={(e) => setRooms(Number(e.target.value))} className={INPUT}>
                  {Array.from({ length: picked.rooms }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className={LABEL}>
                Your name
                <input value={guestName} onChange={(e) => setGuestName(e.target.value)} autoComplete="name" className={INPUT} />
              </label>
              <label className={LABEL}>
                Mobile number
                <input type="tel" inputMode="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} autoComplete="tel" className={INPUT} />
              </label>
              <label className={LABEL}>
                Email (optional)
                <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} autoComplete="email" className={INPUT} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={LABEL}>
                  Adults
                  <input type="number" inputMode="numeric" min={1} value={adults} onChange={(e) => setAdults(e.target.value)} className={INPUT} />
                </label>
                <label className={LABEL}>
                  Children
                  <input type="number" inputMode="numeric" min={0} value={children} onChange={(e) => setChildren(e.target.value)} className={INPUT} />
                </label>
              </div>
              <label className={LABEL}>
                Anything we should know? (optional)
                <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} className={INPUT} />
              </label>
              {/* Filled in only by bots, which is how they are told apart. */}
              <input tabIndex={-1} aria-hidden="true" autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" />
              <p className="text-sm font-semibold text-foreground">
                {formatMoney(picked.rate * rooms * nights)} <span className="text-xs font-normal text-muted">for {nights} {nights === 1 ? "night" : "nights"}, plus GST</span>
              </p>
              {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
              <button type="button" disabled={isPending} onClick={send} className="btn-primary disabled:opacity-60">
                {isPending ? "Sending…" : "Request this room"}
              </button>
              <p className="text-center text-xs text-muted">No payment now. The hotel confirms your room by phone.</p>
            </section>
          )}
        </>
      )}

      {policies && (
        <section className="rounded-xl border border-border p-4">
          <h2 className="mb-1 text-xs font-semibold text-muted">Hotel policies</h2>
          <p className="whitespace-pre-line text-xs text-foreground">{policies}</p>
        </section>
      )}
    </main>
  );
}
