"use client";

import { useState, useTransition } from "react";
import { createPublicBookingAction } from "@/lib/actions/clinic";
import { CheckCircle2 } from "lucide-react";

type Day = { date: string; label: string; slots: string[] };

export function PublicBookingClient({
  token,
  shopName,
  shopLogoUrl,
  isClinic,
  doctorName,
  doctorQualifications,
  doctorPhotoUrl,
  days,
}: {
  token: string;
  shopName: string;
  shopLogoUrl: string | null;
  isClinic: boolean;
  doctorName: string | null;
  doctorQualifications: string | null;
  doctorPhotoUrl: string | null;
  days: Day[];
}) {
  const [selectedDate, setSelectedDate] = useState(days[0]?.date ?? "");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedDay = days.find((d) => d.date === selectedDate);

  function submit() {
    if (!selectedSlot) {
      setError("Pick a time slot");
      return;
    }
    if (!name.trim()) {
      setError("Enter your name");
      return;
    }
    if (!phone.trim()) {
      setError("Enter your phone number");
      return;
    }
    startTransition(async () => {
      const result = await createPublicBookingAction(token, { name, phone, date: selectedDate, time: selectedSlot, reason });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setConfirmed(true);
    });
  }

  if (confirmed) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "linear-gradient(135deg, var(--brand-light), var(--brand-dark))" }}>
          <CheckCircle2 size={32} className="text-white" />
        </span>
        <p className="text-lg font-semibold text-foreground">Booking confirmed</p>
        <p className="text-sm text-muted">
          {name}, your slot at {shopName} is booked for{" "}
          {new Date(selectedDate).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })} at {selectedSlot}.
        </p>
        <p className="text-xs text-muted">Please arrive a few minutes early. Contact {shopName} directly if you need to reschedule.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-6">
      <div className="flex items-center gap-3">
        {(doctorPhotoUrl || shopLogoUrl) && (
          // eslint-disable-next-line @next/next/no-img-element -- public page, shop/doctor-uploaded photo
          <img src={doctorPhotoUrl ?? shopLogoUrl ?? undefined} alt="" className="h-14 w-14 rounded-full object-cover" />
        )}
        <div>
          {doctorName ? (
            <>
              <p className="text-lg font-semibold text-foreground">{doctorName}</p>
              {doctorQualifications && <p className="text-xs text-muted">{doctorQualifications}</p>}
              <p className="text-xs text-muted">{shopName}</p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-foreground">{shopName}</p>
              <p className="text-xs text-muted">{isClinic ? "Book your appointment" : "Book your slot"}</p>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((day) => (
          <button
            key={day.date}
            onClick={() => {
              setSelectedDate(day.date);
              setSelectedSlot(null);
            }}
            className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-medium ${
              selectedDate === day.date ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
            }`}
          >
            {day.label}
          </button>
        ))}
      </div>

      {!selectedDay || selectedDay.slots.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
          No slots available this day — try another date.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {selectedDay.slots.map((slot) => (
            <button
              key={slot}
              onClick={() => setSelectedSlot(slot)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                selectedSlot === slot ? "border-brand bg-brand-soft text-brand-text" : "border-border bg-surface text-foreground"
              }`}
            >
              {slot}
            </button>
          ))}
        </div>
      )}

      {selectedSlot && (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
          <p className="text-sm font-semibold text-brand-text">
            {selectedDay?.label} at {selectedSlot}
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            placeholder="Your phone number"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={isClinic ? "Reason for visit (optional)" : "Service needed (optional)"}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <button onClick={submit} disabled={isPending} className="btn-primary w-full text-center disabled:opacity-60">
            {isPending ? "Booking…" : "Confirm booking"}
          </button>
        </div>
      )}
    </div>
  );
}
