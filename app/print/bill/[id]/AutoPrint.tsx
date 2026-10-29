"use client";

import { useEffect } from "react";

/** Set on a computer from the one-click printing page; remembered by that computer's browser only. */
export const AUTO_PRINT_KEY = "ray-auto-print";

/** When this computer has "print as soon as a bill is saved" on, a freshly made bill prints by itself
 * — with the Fast Print shortcut that means no tap and no dialog at all: save, and the bill comes out. */
export function AutoPrint({ fresh }: { fresh: boolean }) {
  useEffect(() => {
    if (!fresh) return;
    let on = false;
    try {
      on = localStorage.getItem(AUTO_PRINT_KEY) === "1";
    } catch {
      // No storage (private window): print by hand.
    }
    if (!on) return;
    // A moment for the bill's fonts and layout to settle, so the printout is the finished bill.
    const timer = setTimeout(() => window.print(), 500);
    return () => clearTimeout(timer);
  }, [fresh]);
  return null;
}
