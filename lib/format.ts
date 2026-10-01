/** "Dr. Anil" and "Anil" both give "Dr. Anil", so a name typed with its own "Dr." is not shown as "Dr. Dr. Anil". */
export function withDr(name: string): string {
  return `Dr. ${name.replace(/^\s*dr\.?\s+/i, "").trim()}`;
}

// One formatter each, made once and reused. toLocaleString with options builds a new formatter on
// every call, which is slow: a screen with a few hundred amounts spent over half a second of a budget
// phone's time in it (measured opening New Bill). Same output as before.
const MONEY = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DATE_TIME = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function formatMoney(n: number) {
  return `₹${MONEY.format(Number(n))}`;
}

export function formatDateTime(iso: string) {
  return DATE_TIME.format(new Date(iso));
}

const PAYMENT_LABELS: Record<string, string> = { upi: "UPI", udhar: "Udhar", cash: "Cash", card: "Card", online: "Online", other: "Other", adjustment: "Adjusted (return)" };

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

const UNIT_NAMES: Record<string, string> = {
  NOS: "Number (Nos)", PCS: "Pieces", KG: "Kilogram", GM: "Gram", TON: "Tonne", QTL: "Quintal", LTR: "Litre",
  ML: "Millilitre", MTR: "Metre", BOX: "Box", DZN: "Dozen", PKT: "Packet", BAG: "Bag", CFT: "Cubic feet",
  CUM: "Cubic metre", PLATE: "Plate", BOWL: "Bowl", GLASS: "Glass", STRIP: "Strip", BOTTLE: "Bottle",
  SET: "Set", DAY: "Day", HRS: "Hour",
};

/** Full name of a unit code for pickers ("KG" → "Kilogram"); English, and
 * a translation key in menuText.ts. */
export function unitName(unit: string): string {
  return UNIT_NAMES[unit.toUpperCase()] ?? unit;
}

/** Everyday name for a stored unit code on screen ("NOS" → "pc"). The GST
 * codes themselves stay in the data and on invoices. */
export function unitLabel(unit: string | null | undefined): string {
  if (!unit) return "";
  return UNIT_LABELS[unit.toUpperCase()] ?? unit.toLowerCase();
}
