"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Product = { id: string; name: string; stockQuantity: number };
type Booking = { startDate: string; endDate: string; quantity: number; customerName: string; status: string };

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function AvailabilityCalendar({
  products,
  selectedProductId,
  year,
  month,
  bookings,
}: {
  products: Product[];
  selectedProductId: string;
  year: number;
  month: number;
  bookings: Booking[];
}) {
  const router = useRouter();
  const [dayDetail, setDayDetail] = useState<number | null>(null);
  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? products[0];

  function go(productId: string, y: number, m: number) {
    router.push(`/rentals/availability?productId=${productId}&month=${y}-${m}`);
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();

  function bookedQtyOn(day: number) {
    const date = new Date(year, month - 1, day);
    return bookings
      .filter((b) => new Date(b.startDate) <= date && new Date(b.endDate) >= date)
      .reduce((s, b) => s + b.quantity, 0);
  }

  function bookingsOn(day: number) {
    const date = new Date(year, month - 1, day);
    return bookings.filter((b) => new Date(b.startDate) <= date && new Date(b.endDate) >= date);
  }

  const prevMonth = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  return (
    <div className="flex flex-col gap-4">
      <select
        value={selectedProductId}
        onChange={(e) => go(e.target.value, year, month)}
        className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand"
      >
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.stockQuantity} in stock)
          </option>
        ))}
      </select>

      <div className="flex items-center justify-between">
        <button onClick={() => go(selectedProductId, prevMonth.y, prevMonth.m)} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted">
          ← Prev
        </button>
        <p className="text-sm font-semibold text-foreground">{MONTH_NAMES[month - 1]} {year}</p>
        <button onClick={() => go(selectedProductId, nextMonth.y, nextMonth.m)} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted">
          Next →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const booked = bookedQtyOn(day);
          const total = selectedProduct?.stockQuantity ?? 0;
          const isFull = total > 0 && booked >= total;
          const isPartial = booked > 0 && !isFull;
          return (
            <button
              key={day}
              onClick={() => setDayDetail(day)}
              className={`flex aspect-square flex-col items-center justify-center rounded-lg border text-xs ${
                isFull
                  ? "border-danger bg-danger/15 text-danger"
                  : isPartial
                    ? "border-credit bg-credit-soft text-credit"
                    : "border-border bg-surface text-foreground"
              }`}
            >
              <span className="font-medium">{day}</span>
              {booked > 0 && <span className="text-[9px]">{booked}/{total}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 text-[11px] text-muted">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-surface border border-border" /> Free</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-credit-soft border border-credit" /> Partially booked</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-danger/15 border border-danger" /> Fully booked</span>
      </div>

      {dayDetail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setDayDetail(null)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-surface p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground">
              {MONTH_NAMES[month - 1]} {dayDetail}, {year}
            </p>
            {bookingsOn(dayDetail).length === 0 ? (
              <p className="mt-2 text-sm text-muted">Nothing booked — fully available.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {bookingsOn(dayDetail).map((b, i) => (
                  <li key={i} className="rounded-lg border border-border px-3 py-2 text-sm">
                    <p className="font-medium text-foreground">{b.customerName} · {b.quantity} unit(s)</p>
                    <p className="text-xs text-muted">
                      {new Date(b.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} →{" "}
                      {new Date(b.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {b.status}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <button onClick={() => setDayDetail(null)} className="mt-3 w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
