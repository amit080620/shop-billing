// A vehicle's figures from its trips, bilties and expenses: what it earned, what it cost, its
// diesel average. Pure, so the report and the tests agree.

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const EXPENSE_CATEGORIES = ["diesel", "toll", "driver", "loading", "repair", "tyre", "police", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  diesel: "Diesel",
  toll: "Toll",
  driver: "Driver bhatta",
  loading: "Loading / hamali",
  repair: "Repair / service",
  tyre: "Tyre",
  police: "Police / RTO",
  other: "Other",
};

export const PAY_BY_LABEL = { paid: "Paid", to_pay: "To pay", tbb: "To be billed" } as const;
export type PayBy = keyof typeof PAY_BY_LABEL;

/** Diesel average by the full-tank method: the distance between the first and last odometer
 * readings, over the diesel filled after the first reading. Needs two readings. */
export function dieselAverage(fills: { odometer: number | null; litres: number | null }[]): { km: number; litres: number; kmPerLitre: number } | null {
  const read = fills.filter((f) => f.odometer != null && f.odometer > 0).sort((a, b) => (a.odometer as number) - (b.odometer as number));
  if (read.length < 2) return null;
  const km = (read[read.length - 1].odometer as number) - (read[0].odometer as number);
  const litres = read.slice(1).reduce((s, f) => s + (f.litres ?? 0), 0);
  if (km <= 0 || litres <= 0) return null;
  return { km: round2(km), litres: round2(litres), kmPerLitre: Math.round((km / litres) * 10) / 10 };
}

export type VehicleFigures = {
  earnings: number;
  expenses: number;
  byCategory: Partial<Record<ExpenseCategory, number>>;
  profit: number;
  km: number;
  /** What the vehicle cost for each km it ran on billed trips (null without km). */
  costPerKm: number | null;
  average: ReturnType<typeof dieselAverage>;
};

export function vehicleFigures(input: {
  tripCharges: number[];
  tripKm: number[];
  freight: number[];
  expenses: { category: ExpenseCategory; amount: number; litres: number | null; odometer: number | null }[];
}): VehicleFigures {
  const earnings = round2(input.tripCharges.reduce((s, n) => s + n, 0) + input.freight.reduce((s, n) => s + n, 0));
  const byCategory: Partial<Record<ExpenseCategory, number>> = {};
  for (const e of input.expenses) byCategory[e.category] = round2((byCategory[e.category] ?? 0) + e.amount);
  const expenses = round2(input.expenses.reduce((s, e) => s + e.amount, 0));
  const km = round2(input.tripKm.reduce((s, n) => s + n, 0));
  return {
    earnings,
    expenses,
    byCategory,
    profit: round2(earnings - expenses),
    km,
    costPerKm: km > 0 ? round2(expenses / km) : null,
    average: dieselAverage(input.expenses.filter((e) => e.category === "diesel")),
  };
}
