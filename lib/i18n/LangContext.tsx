"use client";

import { createContext, useContext } from "react";
import type { Lang } from "./dictionary";
import { useTranslation } from "./useTranslation";

const LangContext = createContext<Lang>("en");

/** Set once by a server layout/page from the lang cookie, so any client
 * component below can translate without a lang prop — and the server and
 * browser render the same language. */
export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useT() {
  return useTranslation(useContext(LangContext));
}
