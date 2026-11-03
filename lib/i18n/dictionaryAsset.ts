import "server-only";
import { createHash } from "node:crypto";
import { messagesFor, type Lang } from "./dictionary";

type Asset = { lang: Lang; hash: string; src: string; body: string };
const made = new Map<Lang, Asset>();

/** One language's text as a script the browser keeps (app/i18n/[file]): `/i18n/hi.<hash>.js`,
 * cached for a year and replaced only when the words change. Before, every page carried the whole
 * dictionary inside it — about 90 KB in Hindi or Marathi on every load, refresh and printed bill. */
export function dictionaryAsset(lang: Lang): Asset {
  let a = made.get(lang);
  if (!a) {
    const json = JSON.stringify(messagesFor(lang));
    const hash = createHash("sha1").update(json).digest("hex").slice(0, 10);
    a = { lang, hash, src: `/i18n/${lang}.${hash}.js`, body: `(self.__RAY_T__=self.__RAY_T__||{})[${JSON.stringify(lang)}]={h:${JSON.stringify(hash)},m:${json}};` };
    made.set(lang, a);
  }
  return a;
}

/** The text for the server's own render of the page (LangProvider reads it there), so the HTML
 * comes out in the shop's language exactly as before. The same words for everyone of a language,
 * kept once per server. */
export function serveDictionary(lang: Lang): { src: string; hash: string } {
  const g = globalThis as { __RAY_T_SSR__?: Partial<Record<Lang, Record<string, string>>> };
  (g.__RAY_T_SSR__ ??= {})[lang] ??= messagesFor(lang);
  const { src, hash } = dictionaryAsset(lang);
  return { src, hash };
}
