export function formatMoney(n: number) {
  return `₹${Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

const PAYMENT_LABELS: Record<string, string> = { upi: "UPI", udhar: "Udhar", cash: "Cash", card: "Card", online: "Online", other: "Other" };

/** Display name for a stored payment method ("upi" → "UPI"). CSS
 * capitalize turned it into "Upi". */
export function paymentMethodLabel(method: string): string {
  return PAYMENT_LABELS[method] ?? method.charAt(0).toUpperCase() + method.slice(1);
}

const UNIT_LABELS: Record<string, string> = {
  NOS: "pc", PCS: "pc", KG: "kg", GM: "g", LTR: "L", ML: "ml", MTR: "m", TON: "ton", QTL: "quintal",
  BOX: "box", DZN: "dozen", PKT: "pack", BAG: "bag", CFT: "cu ft", CUM: "cu m", PLATE: "plate", BOWL: "bowl",
  GLASS: "glass", STRIP: "strip", BOTTLE: "bottle", SET: "set", DAY: "day", HRS: "hr",
};

/** Everyday name for a stored unit code on screen ("NOS" → "pc"). The GST
 * codes themselves stay in the data and on invoices. */
export function unitLabel(unit: string | null | undefined): string {
  if (!unit) return "";
  return UNIT_LABELS[unit.toUpperCase()] ?? unit.toLowerCase();
}
