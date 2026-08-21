/** Splits a stored phone value into the digits shown in the input.
 * Deterministically strips a literal "+91" prefix first (what the
 * controlled round-trip always produces internally, regardless of how
 * few digits have been typed so far) — a length-based heuristic here
 * previously broke on short, in-progress values (typing just "9"
 * internally became "+919", which got misread as an already-complete
 * number, making phantom extra digits appear after every keystroke).
 * A legacy stored number without a literal "+" only has its leading
 * "91" stripped when it's genuinely a complete 12-digit number. */
export function digitsOnly(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("+91")) {
    return trimmed.slice(3).replace(/\D/g, "").slice(0, 10);
  }
  const cleaned = trimmed.replace(/\D/g, "");
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return cleaned.slice(2);
  }
  return cleaned.slice(0, 10);
}
