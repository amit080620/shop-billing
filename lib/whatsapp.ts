/** Builds a genuine wa.me deep link that opens WhatsApp with the given
 * message pre-filled — was duplicated verbatim across 16 files. Strips
 * any formatting from the phone number and adds India's country code
 * only when given a plain 10-digit number (a number that already has
 * a country code, e.g. from a customer record stored as "+91..." or a
 * different country, is left as-is). */
export function buildWhatsAppLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}
