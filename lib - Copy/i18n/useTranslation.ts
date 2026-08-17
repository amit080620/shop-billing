"use client";

import { translate, interpolate, type Lang } from "./dictionary";

export function useTranslation(lang: Lang) {
  function t(key: string, values?: Record<string, string | number>) {
    const raw = translate(lang, key);
    return values ? interpolate(raw, values) : raw;
  }
  return { t, lang };
}
