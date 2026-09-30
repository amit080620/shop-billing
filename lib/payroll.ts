// A worker's pay for one month, from their attendance marks and what they were already given.
// Shared by the salary sheet and the salary slip, and covered by tests.

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type AttendanceStatus = "present" | "half" | "absent" | "leave" | "off";

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Pay for a month.
 * - Monthly salary: the full salary, less a day's pay for each absence (half for a half day) and
 *   for the days before joining. Unmarked days count as worked — most shops only mark who
 *   didn't come. Leave and weekly offs are paid.
 * - Daily wage: the wage for each day marked present (half for a half day) — for day workers,
 *   the marks are the work.
 * - Commission (a stylist's share of the services they did) is added on top of either. */
export function monthPay(input: {
  month: string; // "YYYY-MM"
  payType: "monthly" | "daily";
  monthlySalary: number;
  dailyWage: number;
  joinedOn: string | null; // "YYYY-MM-DD"
  marks: AttendanceStatus[];
  advances: number;
  bonuses: number;
  salaryPaid: number;
  commission?: number;
}) {
  const days = daysInMonth(input.month);
  const count = (s: AttendanceStatus) => input.marks.filter((m) => m === s).length;
  const present = count("present");
  const half = count("half");
  const absent = count("absent");

  let earned: number;
  let perDay: number;
  let beforeJoining = 0;
  if (input.payType === "daily") {
    perDay = input.dailyWage;
    earned = perDay * (present + half * 0.5);
  } else {
    perDay = input.monthlySalary / days;
    if (input.joinedOn && input.joinedOn.slice(0, 7) === input.month) beforeJoining = Number(input.joinedOn.slice(8, 10)) - 1;
    else if (input.joinedOn && input.joinedOn.slice(0, 7) > input.month) beforeJoining = days;
    earned = Math.max(0, input.monthlySalary - perDay * (absent + half * 0.5 + beforeJoining));
  }
  const commission = round2(input.commission ?? 0);
  earned = round2(earned + commission);
  const due = round2(earned + input.bonuses - input.advances - input.salaryPaid);
  return { days, present, half, absent, leave: count("leave"), off: count("off"), perDay: round2(perDay), beforeJoining, commission, earned, due };
}
