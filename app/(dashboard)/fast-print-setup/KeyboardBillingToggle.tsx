"use client";

import { useEffect, useState } from "react";
import { keyboardBillingOn, setKeyboardBilling } from "@/lib/keyboardBilling";

/** Keyboard billing (lib/keyboardBilling) for this computer. */
export function KeyboardBillingToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(keyboardBillingOn()), []);

  function change(next: boolean) {
    setOn(next);
    setKeyboardBilling(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex cursor-pointer items-start justify-between gap-3">
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">⌨️ Bill with the keyboard, no mouse</span>
          <span className="text-xs text-muted">On this computer only. Like Marg: scan or type items, then Enter, Enter — the bill saves and prints.</span>
        </span>
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand)]" checked={on} onChange={(e) => change(e.target.checked)} />
      </label>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted">
        <li>
          <strong>Enter</strong> on an empty item search opens the bill; <strong>Enter</strong> again saves it. <strong>Esc</strong> goes back.
        </li>
        <li>
          <strong>F10</strong> or <strong>Ctrl + Enter</strong> saves straight away.
        </li>
        <li>
          On the printed bill: <strong>Enter</strong> prints, <strong>P</strong> prints again, <strong>N</strong> starts the next bill.
        </li>
        <li>Fast Billing: type an item&apos;s name and press Enter to add it.</li>
        <li>Turn on &quot;Print as soon as a bill is saved&quot; above too, so saving also prints.</li>
      </ul>
    </div>
  );
}
