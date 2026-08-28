/**
 * Normalizes a phone number to a canonical 10-digit Indian mobile
 * number, so "9876543210", "+91 9876543210", "91-9876543210", and
 * "09876543210" are all recognized as the SAME customer instead of
 * creating duplicate records with split udhar/loyalty/order history.
 *
 * Every place that creates or looks up a customer by phone should
 * normalize through this first — see findOrCreateCustomerByPhone in
 * lib/actions/customers.ts for the shared lookup that uses it.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}
