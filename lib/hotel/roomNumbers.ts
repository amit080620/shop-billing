/** Turns what an owner types when adding rooms in bulk into a list of room
 * numbers: "101-110" is ten rooms, "201, 202, 205" is three, and the two can
 * be mixed ("101-105, 201"). Ranges must be numeric; anything else is kept as
 * a plain room name ("G1", "Penthouse"). Duplicates are dropped, order kept. */
export const MAX_ROOMS_PER_ADD = 200;

export function parseRoomNumbers(input: string): { numbers: string[]; error?: string } {
  const parts = input
    .split(/[,\n;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { numbers: [], error: "Enter at least one room number" };

  const seen = new Set<string>();
  const numbers: string[] = [];
  for (const part of parts) {
    const range = /^(\d{1,5})\s*[-–—to]+\s*(\d{1,5})$/i.exec(part);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (to < from) return { numbers: [], error: `"${part}" counts backwards — write it as ${range[2]}-${range[1]}` };
      if (to - from + 1 > MAX_ROOMS_PER_ADD) return { numbers: [], error: `Add at most ${MAX_ROOMS_PER_ADD} rooms at a time` };
      for (let n = from; n <= to; n++) {
        const s = String(n);
        if (!seen.has(s)) {
          seen.add(s);
          numbers.push(s);
        }
      }
    } else {
      if (part.length > 20) return { numbers: [], error: `"${part.slice(0, 20)}…" is too long for a room number` };
      if (!seen.has(part)) {
        seen.add(part);
        numbers.push(part);
      }
    }
    if (numbers.length > MAX_ROOMS_PER_ADD) return { numbers: [], error: `Add at most ${MAX_ROOMS_PER_ADD} rooms at a time` };
  }
  return { numbers };
}
