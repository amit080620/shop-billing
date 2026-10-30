"use client";

import { useEffect, useRef, useState } from "react";
import { focusKind, keyboardBillingOn, overlayOpen, readBillingKey, type BillingKey } from "./keyboardBilling";

/** Keyboard billing's keys on a billing screen (lib/keyboardBilling), when this computer has it on.
 * `onKey` gets "next", "save" or "back" and returns true when it acted, so the key does nothing else.
 * A key some field or popup already used is left alone. Returns whether keyboard billing is on. */
export function useBillingKeys(onKey: (key: Exclude<BillingKey, "other" | "ignore">) => boolean): boolean {
  const [on, setOn] = useState(false);
  const handler = useRef(onKey);
  handler.current = onKey;

  useEffect(() => setOn(keyboardBillingOn()), []);

  useEffect(() => {
    if (!on) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const el = document.activeElement;
      const kind = focusKind(el);
      const key = readBillingKey(e, kind, kind === "search" ? !(el as HTMLInputElement).value.trim() : true);
      if (key === "other" || key === "ignore" || overlayOpen()) return;
      if (handler.current(key)) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [on]);

  return on;
}
