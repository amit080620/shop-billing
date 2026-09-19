import { SCREEN_STRINGS } from "./screens";
import { MENU_TEXT } from "./menuText";
import { PAGE_TEXT } from "./pageText";
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
for (const [english, [hiText, mrText]] of [...Object.entries(MENU_TEXT), ...Object.entries(PAGE_TEXT)]) {
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
