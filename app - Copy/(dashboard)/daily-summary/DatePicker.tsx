"use client";

import { useRouter, usePathname } from "next/navigation";

export function DatePicker({ date }: { date: string }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <input
      type="date"
      value={date}
      onChange={(e) => router.push(`${pathname}?date=${e.target.value}`)}
      className="no-print rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
    />
  );
}
