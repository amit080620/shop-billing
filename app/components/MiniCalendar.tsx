"use client";

import { useRouter } from "next/navigation";
import { todayIso } from "@/lib/dateHelpers";

export function MiniCalendar() {
  const router = useRouter();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = todayIso();

  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function isoFor(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return (
    <div className="flex h-full flex-col gap-1.5">
      <div className="grid grid-cols-7 gap-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span
            key={i}
            className={`text-center text-[9px] font-medium ${i === 0 ? "text-danger" : "text-muted"}`}
          >
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <span key={i} />;
          const iso = isoFor(day);
          const isToday = iso === today;
          const isSunday = i % 7 === 0;
          return (
            <button
              key={i}
              onClick={() => router.push(`/daily-summary?date=${iso}`)}
              className={`flex aspect-square w-full items-center justify-center rounded-full text-[10px] ${
                isToday ? "font-bold text-brand-text" : isSunday ? "font-medium text-danger" : "text-foreground"
              }`}
              style={
                isToday
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
