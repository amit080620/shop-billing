"use client";

import { useContext } from "react";
import { interpolate } from "./interpolate";
import { LangContext } from "./LangContext";
import type { Lang } from "./dictionary";

/** Client translator. Text comes from the nearest LangProvider (only the
 * shop's language is sent); a missing key shows as itself, which for the
 * English-worded keys (menuText/pageText) is the English text. */
export function useTranslation(lang: Lang) {
  const { messages } = useContext(LangContext);
  function t(key: string, values?: Record<string, string | number>) {
    const raw = messages[key] ?? key;
    return values ? interpolate(raw, values) : raw;
  }
  return { t, lang };
}
