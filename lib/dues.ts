// Payments due, bill by bill: a party's payments settle their oldest bills first (FIFO), and what
// is left of each bill falls due on its due date (bill date + the party's credit days). Pure, so
// the report and the tests agree.

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const dayMs = 86400000;

export type DueBill = { id: string; number: string; date: string; due: string; credit: number };
export type PendingBill = DueBill & { pending: number; overdueDays: number };

/** What is still unpaid of each bill once `paid` has settled the oldest ones. */
export function pendingBills(bills: DueBill[], paid: number, today: string): PendingBill[] {
  let left = Math.max(0, paid);
  const out: PendingBill[] = [];
  for (const b of [...bills].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))) {
    const covered = Math.min(left, b.credit);
    left = r2(left - covered);
    const pending = r2(b.credit - covered);
    if (pending > 0.009) out.push({ ...b, pending, overdueDays: Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${b.due}T00:00:00Z`)) / dayMs)) });
  }
  return out;
}

export type Bucket = "not_due" | "1-30" | "31-60" | "61-90" | "90+";
export const bucketOf = (overdueDays: number): Bucket => (overdueDays <= 0 ? "not_due" : overdueDays <= 30 ? "1-30" : overdueDays <= 60 ? "31-60" : overdueDays <= 90 ? "61-90" : "90+");

/** A party's position: owed, overdue, and the oldest overdue days. */
export function partyDues(pending: PendingBill[]) {
  const buckets: Record<Bucket, number> = { not_due: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const b of pending) buckets[bucketOf(b.overdueDays)] = r2(buckets[bucketOf(b.overdueDays)] + b.pending);
  const owed = r2(pending.reduce((s, b) => s + b.pending, 0));
  return { owed, overdue: r2(owed - buckets.not_due), maxOverdueDays: pending.reduce((m, b) => Math.max(m, b.overdueDays), 0), buckets };
}
