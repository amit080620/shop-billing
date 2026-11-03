"use client";

import { createContext, use, useContext, useEffect } from "react";
import type { Lang } from "./dictionary";
import { useTranslation } from "./useTranslation";

type Dict = Record<string, string>;
type LangValue = { lang: Lang; messages: Dict };
/** The shop language's text as a cached script (lib/i18n/dictionaryAsset). */
type Asset = { src: string; hash: string };

declare global {
  var __RAY_T__: Partial<Record<string, { h: string; m: Dict }>> | undefined;
  var __RAY_T_SSR__: Partial<Record<string, Dict>> | undefined;
}

export const LangContext = createContext<LangValue>({ lang: "en", messages: {} });

const STORE = (lang: Lang) => `ray-t-${lang}`;
const loading = new Map<string, Promise<Dict>>();

/** The words already in this tab (the script ran), when they are this build's. */
function inTab(lang: Lang, hash: string): Dict | undefined {
  const w = globalThis.__RAY_T__?.[lang];
  return w && w.h === hash ? w.m : undefined;
}

/** Waits for the language's script (started in the page head, or started here), and falls back to
 * the copy kept on this device, then to English — never a broken screen (offline billing). */
function load(lang: Lang, asset: Asset): Promise<Dict> {
  const key = `${lang}.${asset.hash}`;
  let p = loading.get(key);
  if (!p) {
    p = new Promise<Dict>((resolve) => {
      const kept = () => {
        try {
          const s = JSON.parse(localStorage.getItem(STORE(lang)) ?? "null") as { m?: Dict } | null;
          if (s?.m) return resolve(s.m);
        } catch {
          /* nothing kept */
        }
        resolve({});
      };
      const ran = () => {
        const m = inTab(lang, asset.hash);
        if (m) resolve(m);
        else kept();
      };
      let el = document.querySelector<HTMLScriptElement>(`script[src="${asset.src}"]`);
      if (!el) {
        el = document.createElement("script");
        el.src = asset.src;
        el.async = true;
        document.head.appendChild(el);
      }
      el.addEventListener("load", ran, { once: true });
      el.addEventListener("error", kept, { once: true });
      // A script that already finished before this listener was added.
      if (inTab(lang, asset.hash)) ran();
    });
    loading.set(key, p);
  }
  return p;
}

/** Set once by a server layout/page: the shop's language and only that language's text, so the
 * browser never downloads the other languages and server and browser render the same words. With
 * `dictionary` the text comes from a script the browser caches (once per change of the words)
 * instead of riding inside every page; `messages` sends it inside the page, as before. */
export function LangProvider({ lang, messages, dictionary, children }: { lang: Lang; messages?: Dict; dictionary?: Asset; children: React.ReactNode }) {
  // Keep a copy on this device for offline use (once per change of the words, when the phone is
  // idle). Before the `use()` below: a render that waited for the words is replayed, and hooks after
  // a waiting `use()` would no longer line up.
  useEffect(() => {
    if (!dictionary) return;
    const save = () => {
      try {
        const words = inTab(lang, dictionary.hash);
        const k = STORE(lang);
        if (words && (JSON.parse(localStorage.getItem(k) ?? "null") as { h?: string } | null)?.h !== dictionary.hash) localStorage.setItem(k, JSON.stringify({ h: dictionary.hash, m: words }));
      } catch {
        /* storage full or blocked: offline shows English */
      }
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(save);
    else setTimeout(save, 2000);
  }, [lang, dictionary]);
  let m = messages;
  if (!m && dictionary) {
    if (typeof window === "undefined") m = globalThis.__RAY_T_SSR__?.[lang] ?? {};
    else m = inTab(lang, dictionary.hash) ?? use(load(lang, dictionary));
  }
  return <LangContext.Provider value={{ lang, messages: m ?? {} }}>{children}</LangContext.Provider>;
}

export function useT() {
  return useTranslation(useContext(LangContext).lang);
}
