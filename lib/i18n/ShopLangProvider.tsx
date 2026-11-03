import "server-only";
import { preinit } from "react-dom";
import type { Lang } from "./dictionary";
import { LangProvider } from "./LangContext";
import { serveDictionary } from "./dictionaryAsset";

/** LangProvider for a shop screen: the language's text as a cached script started in the page head
 * (lib/i18n/dictionaryAsset), instead of inside every page, refresh and printed bill. */
export function ShopLangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const dictionary = serveDictionary(lang);
  preinit(dictionary.src, { as: "script" });
  return (
    <LangProvider lang={lang} dictionary={dictionary}>
      {children}
    </LangProvider>
  );
}
