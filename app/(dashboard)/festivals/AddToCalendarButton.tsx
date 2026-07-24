"use client";

import { downloadFestivalReminder } from "@/lib/ics";

export function AddToCalendarButton({
  festivalName,
  festivalDateIso,
  prepHints,
}: {
  festivalName: string;
  festivalDateIso: string;
  prepHints: string[];
}) {
  return (
    <button
      onClick={() => downloadFestivalReminder(festivalName, new Date(`${festivalDateIso}T00:00:00`), prepHints)}
      className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground"
    >
      📅 Add restock reminder to my phone calendar
    </button>
  );
}
