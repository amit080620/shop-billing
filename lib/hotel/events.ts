// Banquet and event rules. Pure.
export const SESSIONS = ["morning", "evening", "full_day"] as const;
export type EventSession = (typeof SESSIONS)[number];
export const SESSION_LABEL: Record<EventSession, string> = { morning: "Morning", evening: "Evening", full_day: "Full day" };

/** Whether two sessions of one day overlap: a full day takes both. */
export const eventsClash = (a: string, b: string) => a === b || a === "full_day" || b === "full_day";

/** SAC for banquet and event hosting, printed on the invoice lines. */
export const BANQUET_SAC = "996334";

export type EventLine = { description: string; hsnCode: string | null; quantity: number; unitPrice: number; gstPercent: number };

/** An event's invoice lines; amounts are before tax. Lines at nothing are left out. */
export function eventLines(e: { hallRent: number; plates: number; plateRate: number; decoration: number; otherAmount: number; otherLabel?: string | null; gstPercent: number; eventName: string }): EventLine[] {
  const lines: EventLine[] = [];
  if (e.hallRent > 0) lines.push({ description: `Hall rent · ${e.eventName}`, hsnCode: BANQUET_SAC, quantity: 1, unitPrice: e.hallRent, gstPercent: e.gstPercent });
  if (e.plates > 0 && e.plateRate > 0) lines.push({ description: `Catering · ${e.plates} plates`, hsnCode: BANQUET_SAC, quantity: e.plates, unitPrice: e.plateRate, gstPercent: e.gstPercent });
  if (e.decoration > 0) lines.push({ description: "Stage and decoration", hsnCode: BANQUET_SAC, quantity: 1, unitPrice: e.decoration, gstPercent: e.gstPercent });
  if (e.otherAmount > 0) lines.push({ description: e.otherLabel?.trim() || "Other charges", hsnCode: BANQUET_SAC, quantity: 1, unitPrice: e.otherAmount, gstPercent: e.gstPercent });
  return lines;
}

/** Before tax and with GST, for the screen. */
export function eventAmounts(e: Parameters<typeof eventLines>[0]) {
  const taxable = eventLines(e).reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const gst = (taxable * e.gstPercent) / 100;
  return { taxable: Math.round(taxable * 100) / 100, gst: Math.round(gst * 100) / 100, total: Math.round(taxable + gst) };
}
