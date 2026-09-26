/** Where a booking came from. OTAs (online travel agents like MakeMyTrip)
 * and agents/brokers usually take a commission, which the hotel owes them
 * or has already had deducted — so the source decides whether the commission
 * fields matter on a booking. */
export const BOOKING_SOURCES = [
  { value: "walk_in", label: "Walk-in", kind: "direct" },
  { value: "phone", label: "Phone call", kind: "direct" },
  { value: "website", label: "Own website / WhatsApp", kind: "direct" },
  { value: "corporate", label: "Corporate", kind: "direct" },
  { value: "makemytrip", label: "MakeMyTrip", kind: "ota" },
  { value: "goibibo", label: "Goibibo", kind: "ota" },
  { value: "booking_com", label: "Booking.com", kind: "ota" },
  { value: "agoda", label: "Agoda", kind: "ota" },
  { value: "expedia", label: "Expedia", kind: "ota" },
  { value: "cleartrip", label: "Cleartrip", kind: "ota" },
  { value: "airbnb", label: "Airbnb", kind: "ota" },
  { value: "oyo", label: "OYO", kind: "ota" },
  { value: "agent", label: "Travel agent / broker", kind: "agent" },
  { value: "other", label: "Other", kind: "direct" },
] as const;

export type BookingSource = (typeof BOOKING_SOURCES)[number]["value"];

export const BOOKING_SOURCE_VALUES = BOOKING_SOURCES.map((s) => s.value) as [BookingSource, ...BookingSource[]];

export function sourceLabel(value: string): string {
  return BOOKING_SOURCES.find((s) => s.value === value)?.label ?? value;
}

/** Whether a source normally pays a commission (OTA or agent). */
export function sourceTakesCommission(value: string): boolean {
  const kind = BOOKING_SOURCES.find((s) => s.value === value)?.kind;
  return kind === "ota" || kind === "agent";
}

/** Whether the guest usually pays the OTA up-front (the hotel then receives
 * the money, minus commission, later) rather than paying at the desk. */
export function sourceIsOta(value: string): boolean {
  return BOOKING_SOURCES.find((s) => s.value === value)?.kind === "ota";
}

export const MEAL_PLANS = [
  { value: "EP", label: "Room only", short: "EP" },
  { value: "CP", label: "With breakfast", short: "CP" },
  { value: "MAP", label: "Breakfast + dinner", short: "MAP" },
  { value: "AP", label: "All meals", short: "AP" },
] as const;

export type MealPlan = (typeof MEAL_PLANS)[number]["value"];

export const ID_PROOF_TYPES = ["Aadhaar", "Passport", "Driving licence", "Voter ID", "PAN", "Other"] as const;

export type BookingStatus = "reserved" | "checked_in" | "checked_out" | "cancelled" | "no_show";

export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ["reserved", "checked_in"];

export const CHARGE_KINDS = [
  { value: "extra_bed", label: "Extra bed" },
  { value: "laundry", label: "Laundry" },
  { value: "minibar", label: "Minibar" },
  { value: "transport", label: "Pick-up / drop / cab" },
  { value: "early_late", label: "Early check-in / late check-out" },
  { value: "misc", label: "Other charge" },
] as const;

export type ChargeKind = (typeof CHARGE_KINDS)[number]["value"];

export const PAYMENT_METHODS = ["cash", "card", "upi", "online", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** SAC (service accounting code) for hotel/lodging accommodation, printed
 * against room lines on the GST invoice. */
export const ACCOMMODATION_SAC = "996311";
