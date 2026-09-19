const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : "");
}

function join(...parts: string[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Whole numbers in the Indian system: thousand, lakh, crore. */
function words(n: number): string {
  if (n < 100) return belowHundred(n);
  if (n < 1000) return join(`${ONES[Math.floor(n / 100)]} Hundred`, belowHundred(n % 100));
  if (n < 1e5) return join(`${belowHundred(Math.floor(n / 1000))} Thousand`, words(n % 1000));
  if (n < 1e7) return join(`${belowHundred(Math.floor(n / 1e5))} Lakh`, words(n % 1e5));
  return join(`${words(Math.floor(n / 1e7))} Crore`, words(n % 1e7));
}

/** "Rupees One Thousand Two Hundred Five and Fifty Paise Only" — the
 * amount-in-words line Indian invoices carry. */
export function amountInWords(amount: number): string {
  const totalPaise = Math.round(Math.abs(amount) * 100);
  const rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;
  const rupeeText = rupees === 0 ? "Zero" : words(rupees);
  return `Rupees ${rupeeText}${paise ? ` and ${belowHundred(paise)} Paise` : ""} Only`;
}
