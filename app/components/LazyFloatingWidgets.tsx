"use client";

import dynamic from "next/dynamic";

const FloatingCalculator = dynamic(() => import("./FloatingCalculator").then((m) => m.FloatingCalculator), { ssr: false });
const FloatingAssistant = dynamic(() => import("./FloatingAssistant").then((m) => m.FloatingAssistant), { ssr: false });

/** Neither widget is needed for the FIRST paint of any page — they
 * only matter once someone actually taps the bubble — so loading
 * their JS after the main content instead of blocking on it
 * genuinely speeds up initial page load across the whole app,
 * without changing what either widget does or removing anything. */
export function LazyFloatingWidgets({ calculatorEnabled, assistantEnabled }: { calculatorEnabled: boolean; assistantEnabled: boolean }) {
  return (
    <>
      <FloatingCalculator enabled={calculatorEnabled} />
      <FloatingAssistant enabled={assistantEnabled} />
    </>
  );
}
