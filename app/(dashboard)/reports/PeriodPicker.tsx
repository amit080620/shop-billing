"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

import { MONTHS } from "@/lib/dateHelpers";

export function PeriodPicker({ year, month }: { year: number; month: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Keeps any other choice on the page (like the B2B / B2C view) when the month changes.
  function update(nextYear: number, nextMonth: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(nextYear));
    params.set("month", String(nextMonth));
    router.push(`${pathname}?${params.toString()}`);
  }

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 4 + i);

  return (
    <div className="no-print flex gap-2">
      <select
        value={month}
        onChange={(e) => update(year, Number(e.target.value))}
        className="neu-card px-3 py-2 text-sm outline-none focus:border-brand"
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
        className="neu-card px-3 py-2 text-sm outline-none focus:border-brand"
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

