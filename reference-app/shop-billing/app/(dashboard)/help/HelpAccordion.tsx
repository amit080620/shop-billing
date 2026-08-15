"use client";

import { useState } from "react";

export function HelpAccordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      {items.map((item, i) => (
        <div key={i}>
          <button
            onClick={() => setOpen((cur) => (cur === i ? null : i))}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span className="text-sm font-medium text-foreground">{item.q}</span>
            <span className={`shrink-0 text-muted transition-transform ${open === i ? "rotate-180" : ""}`}>
              ⌄
            </span>
          </button>
          {open === i && (
            <p className="px-4 pb-3 text-sm text-muted">{item.a}</p>
          )}
        </div>
      ))}
    </div>
  );
}
