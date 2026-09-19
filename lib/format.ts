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
