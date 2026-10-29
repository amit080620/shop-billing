"use client";

import { useEffect, useState } from "react";
import { AUTO_PRINT_KEY } from "@/app/print/bill/[id]/AutoPrint";

/** "Print as soon as a bill is saved" for this computer. */
export function AutoPrintToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      setOn(localStorage.getItem(AUTO_PRINT_KEY) === "1");
    } catch {}
  }, []);

  function change(next: boolean) {
    setOn(next);
    try {
      if (next) localStorage.setItem(AUTO_PRINT_KEY, "1");
      else localStorage.removeItem(AUTO_PRINT_KEY);
    } catch {}
  }

  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground">Print as soon as a bill is saved</span>
        <span className="text-xs text-muted">On this computer only. Save the bill and it prints by itself — no Print button.</span>
      </span>
      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand)]" checked={on} onChange={(e) => change(e.target.checked)} />
    </label>
  );
}
