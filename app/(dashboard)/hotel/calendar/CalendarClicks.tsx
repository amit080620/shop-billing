"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

/** One handler for every empty cell of the calendar. A link in each cell (every room × 14 days) was
 * another piece for an old phone to start up, and another screen queued to load ahead. */
export function CalendarClicks({ className, children }: { className: string; children: ReactNode }) {
  const router = useRouter();
  const open = (target: EventTarget) => {
    const href = (target as HTMLElement).closest<HTMLElement>("[data-book]")?.dataset.book;
    if (href) router.push(href);
  };
  return (
    <div
      className={className}
      onClick={(e) => open(e.target)}
      onKeyDown={(e) => {
        if (e.key === "Enter") open(e.target);
      }}
    >
      {children}
    </div>
  );
}
