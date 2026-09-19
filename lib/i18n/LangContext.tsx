"use client";

import { createContext, useContext } from "react";
import type { Lang } from "./dictionary";
import { useTranslation } from "./useTranslation";

type LangValue = { lang: Lang; messages: Record<string, string> };

export const LangContext = createContext<LangValue>({ lang: "en", messages: {} });

/** Set once by a server layout/page: the shop's language and only that
 * language's text (see messagesFor), so the browser never downloads the
 * other languages and server and browser render the same words. */
export function LangProvider({ lang, messages, children }: { lang: Lang; messages: Record<string, string>; children: React.ReactNode }) {
  return <LangContext.Provider value={{ lang, messages }}>{children}</LangContext.Provider>;
}

export function useT() {
  return useTranslation(useContext(LangContext).lang);
}
