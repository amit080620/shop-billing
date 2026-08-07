const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function dayKeyFor(date: Date): string {
  return DAY_KEYS[date.getDay()];
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** All possible slot start times within the day's working-hour ranges,
 * minus any already booked — the whole reason this exists is so a
 * patient never sees (or can pick) a time that's actually taken. */
export function computeAvailableSlots(
  ranges: { start: string; end: string }[],
  slotMinutes: number,
  bookedTimes: string[],
): string[] {
  const booked = new Set(bookedTimes);
  const slots: string[] = [];
  for (const range of ranges) {
    let cursor = timeToMinutes(range.start);
    const end = timeToMinutes(range.end);
    while (cursor + slotMinutes <= end) {
      const slot = minutesToTime(cursor);
      if (!booked.has(slot)) slots.push(slot);
      cursor += slotMinutes;
    }
  }
  return slots;
}
