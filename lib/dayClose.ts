// The arithmetic of closing the day — shared by the counting screen (live, as notes are counted)
// and the server (which saves it), so the two always agree.

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Notes counted one by one; coins are entered as a single rupee amount. */
export const DENOMINATIONS = [500, 200, 100, 50, 20, 10] as const;

export type Denominations = Partial<Record<(typeof DENOMINATIONS)[number] | "coins", number>>;

/** The cash counted, from how many of each note there are (plus coins in rupees). */
export function countedFromDenominations(d: Denominations): number {
  let total = 0;
  for (const note of DENOMINATIONS) total += note * Math.max(0, Math.floor(Number(d[note] ?? 0)));
  total += Math.max(0, Number(d.coins ?? 0));
  return round2(total);
}

/** What should be in the drawer (the morning's opening cash plus the day's cash change), how far
 * the count is from it (+ excess, − short), and what stays in the drawer for tomorrow after any
 * cash is taken out to the bank or home. */
export function dayCloseFigures(input: { openingCash: number; cashChange: number; countedCash: number; cashRemoved: number }) {
  const expected = round2(input.openingCash + input.cashChange);
  const counted = round2(Math.max(0, input.countedCash));
  const removed = round2(Math.max(0, input.cashRemoved));
  return {
    expected,
    counted,
    difference: round2(counted - expected),
    removed,
    carryForward: round2(counted - removed),
  };
}
