import { SCREEN_STRINGS } from "./screens";
import { MENU_TEXT } from "./menuText";
import { PAGE_TEXT } from "./pageText";
import { HOTEL_TEXT } from "./hotelText";
import { GARMENT_TEXT } from "./garmentText";
import { PURCHASE_TEXT } from "./purchaseText";
import { NEW_HOME_TEXT } from "./newHomeText";
import { NEW_POS_TEXT } from "./newPosText";
import { HOTEL_OPS_TEXT } from "./hotelOpsText";
import en from "./en";
import hi from "./hi";
import mr from "./mr";

export type Lang = "en" | "hi" | "mr";

/** Server-side dictionary. Browsers get one language at a time through
 * LangProvider (messagesFor), never this module. */
export const translations: Record<Lang, Record<string, string>> = { en, hi, mr };

// Newer screen text lives in ./screens.ts, one line per key in all three languages.
for (const [key, [enText, hiText, mrText]] of Object.entries(SCREEN_STRINGS)) {
  translations.en[key] ??= enText;
  translations.hi[key] ??= hiText;
  translations.mr[key] ??= mrText;
}
// Menu/report text is keyed by its English wording (English falls back to the key).
// Garment and purchase text come last, so they only fill words the other tables don't have.
for (const [english, [hiText, mrText]] of [...Object.entries(MENU_TEXT), ...Object.entries(PAGE_TEXT), ...Object.entries(HOTEL_TEXT), ...Object.entries(GARMENT_TEXT), ...Object.entries(PURCHASE_TEXT), ...Object.entries(NEW_HOME_TEXT), ...Object.entries(NEW_POS_TEXT), ...Object.entries(HOTEL_OPS_TEXT)]) {
  translations.hi[english] ??= hiText;
  translations.mr[english] ??= mrText;
}

export { interpolate } from "./interpolate";

export function translate(lang: Lang, key: string): string {
  return translations[lang]?.[key] ?? translations.en[key] ?? key;
}

/** Everything the browser needs for one language: that language merged
 * over English, so a missing translation still shows English. */
export function messagesFor(lang: Lang): Record<string, string> {
  return lang === "en" ? translations.en : { ...translations.en, ...translations[lang] };
}
