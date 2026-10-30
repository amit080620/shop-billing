"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyboardHint } from "@/app/components/KeyboardHint";
import { focusKind, keyboardBillingOn, lastBillingScreen, overlayOpen, printedAlready } from "@/lib/keyboardBilling";
import { PRINT_EVENT } from "@/lib/printHelper";

/** Keyboard billing on the bill (lib/keyboardBilling): Enter prints it unless it has printed already
 * (or is printing by itself), P prints it again, N or Esc goes to the next bill on the screen it was
 * made from. Only on a computer with keyboard billing on. */
export function BillPageKeys({ newBillHref }: { newBillHref: string }) {
  const router = useRouter();
  const [on, setOn] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => setOn(keyboardBillingOn()), []);

  useEffect(() => {
    if (!on) return;
    const next = lastBillingScreen() ?? newBillHref;
    router.prefetch(next);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      const focus = focusKind(document.activeElement);
      if (focus === "field" || overlayOpen()) return;
      const key = e.key.toLowerCase();
      if (key === "enter") {
        // On a focused button or link, Enter presses it, as always.
        if (focus !== "page") return;
        e.preventDefault();
        if (printedAlready()) setNote("Printed already — press P to print again.");
        else window.dispatchEvent(new Event(PRINT_EVENT));
      } else if (key === "p") {
        e.preventDefault();
        setNote(null);
        window.dispatchEvent(new Event(PRINT_EVENT));
      } else if (key === "n" || key === "escape") {
        e.preventDefault();
        router.push(next);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [on, newBillHref, router]);

  if (!on) return null;
  return (
    <div className="no-print flex flex-col items-center gap-1">
      <KeyboardHint keys={[["Enter", "print"], ["P", "print again"], ["N", "next bill"]]} />
      {note && <p className="hidden text-[11px] font-medium text-brand-text md:block">{note}</p>}
    </div>
  );
}
