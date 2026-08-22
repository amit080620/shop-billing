"use client";

import { useRouter } from "next/navigation";
import { todayIso } from "@/lib/dateHelpers";

export function AppointmentsCalendar({ basePath, selectedDate }: { basePath: string; selectedDate: string }) {
  const router = useRouter();
  const [selYear, selMonth] = selectedDate.split("-").map(Number);
  const year = selYear;
  const month = selMonth - 1;
  const today = todayIso();

  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function isoFor(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function changeMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    router.push(`${basePath}?date=${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`);
  }

  return (
    <div className="neu-card flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <button onClick={() => changeMonth(-1)} className="rounded-lg px-2 py-1 text-sm text-muted" aria-label="Previous month">
          ←
        </button>
        <p className="text-sm font-semibold text-foreground">
          {firstOfMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
        </p>
        <button onClick={() => changeMonth(1)} className="rounded-lg px-2 py-1 text-sm text-muted" aria-label="Next month">
          →
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className={`text-center text-[10px] font-medium ${i === 0 ? "text-danger" : "text-muted"}`}>
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <span key={i} />;
          const iso = isoFor(day);
          const isToday = iso === today;
          const isSelected = iso === selectedDate;
          const isSunday = i % 7 === 0;
          return (
            <button
              key={i}
              onClick={() => router.push(`${basePath}?date=${iso}`)}
              className={`flex aspect-square w-full items-center justify-center rounded-full text-xs ${
                isSelected ? "font-bold text-white" : isToday ? "font-bold text-brand-text" : isSunday ? "font-medium text-danger" : "text-foreground"
              }`}
              style={
                isSelected
                  ? { background: "linear-gradient(135deg, var(--brand-light), var(--brand-dark))" }
                  : isToday
                    ? { boxShadow: "-2px -2px 4px var(--neu-light), 2px 2px 4px var(--neu-dark)" }
                    : { boxShadow: "-1px -1px 2px var(--neu-light), 1px 1px 2px var(--neu-dark)" }
              }
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
