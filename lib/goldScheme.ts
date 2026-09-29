// A gold saving scheme's standing, from what has been paid into it. Shared by the scheme screens,
// the bill that redeems it and the server; covered by tests.

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** A calendar date moved by whole months, kept to the month's last day when it is shorter. */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

export function schemeFigures(input: { installmentAmount: number; totalInstallments: number; bonusAmount: number; paid: number; startDate: string; today: string }) {
  const target = round2(input.installmentAmount * input.totalInstallments);
  const paid = round2(input.paid);
  const complete = paid >= target - 0.005;
  const installmentsPaid = Math.min(input.totalInstallments, Math.floor(paid / input.installmentAmount + 1e-9));
  // The next instalment falls due one month after the last one covered.
  const nextDue = complete ? null : addMonthsIso(input.startDate, installmentsPaid);
  return {
    target,
    paid,
    remaining: round2(Math.max(0, target - paid)),
    installmentsPaid,
    complete,
    /** What the customer can buy with it now: what they paid, plus the bonus once every instalment is in. */
    value: round2(paid + (complete ? input.bonusAmount : 0)),
    /** What it will be worth at the end. */
    maturityValue: round2(target + input.bonusAmount),
    nextDue,
    overdue: !!nextDue && nextDue < input.today,
  };
}
