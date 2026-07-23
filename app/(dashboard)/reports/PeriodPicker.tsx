"use client";

import { useRouter, usePathname } from "next/navigation";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function PeriodPicker({ year, month }: { year: number; month: number }) {
  const router = useRouter();
  const pathname = usePathname();

  function update(nextYear: number, nextMonth: number) {
    router.push(`${pathname}?year=${nextYear}&month=${nextMonth}`);
  }

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 4 + i);

  return (
    <div className="no-print flex gap-2">
      <select
        value={month}
        onChange={(e) => update(year, Number(e.target.value))}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      >
        {MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => update(Number(e.target.value), month)}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}

export { MONTHS };
