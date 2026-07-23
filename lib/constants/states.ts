// Official GST state codes (first 2 digits of any GSTIN identify the state).
// Stable reference data — part of the GSTIN structure itself, not something
// that changes with rate reforms.
export const INDIAN_STATES: { code: string; name: string }[] = [
  { code: "01", name: "Jammu & Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra & Nagar Haveli and Daman & Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman & Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
];

export function stateNameForCode(code: string | null | undefined) {
  return INDIAN_STATES.find((s) => s.code === code)?.name ?? "";
}

/** GSTIN's first 2 digits are the state code — used to auto-fill the state
 * dropdown when a party's GSTIN is entered. */
export function stateCodeFromGstin(gstin: string) {
  const digits = gstin.trim().slice(0, 2);
  return INDIAN_STATES.some((s) => s.code === digits) ? digits : null;
}

// Current GST slabs under GST 2.0 (effective 22 Sept 2025). The old 12%/28%
// slabs were retired; most goods moved to 5% or 18%, with 40% for luxury/sin
// goods. Kept as quick-pick options — any custom rate can still be typed.
export const COMMON_GST_RATES = [0, 5, 18, 40];
