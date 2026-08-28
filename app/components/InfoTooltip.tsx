"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

/**
 * Replaces a static "helper text" paragraph (the kind that sits under
 * a heading explaining what a screen is for) with a small (i) icon
 * that reveals the same text on tap. The screen stays visually clean
 * by default; the explanation is still one tap away for whoever
 * actually needs it.
 *
 * Theme-aware (uses the app's own surface/border/foreground tokens,
 * unlike a one-off tooltip hardcoded to light colors), so it reads
 * correctly in both light and dark mode everywhere it's used.
 */
export function InfoTooltip({ message, align = "left" }: { message: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More info"
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted ${open ? "bg-brand-soft text-brand-text" : "bg-surface-2"}`}
      >
        <Info size={12} />
      </button>
      {open && (
        <div
          className={`absolute top-full z-30 mt-1.5 w-64 rounded-xl border border-border bg-surface p-3 text-left text-xs leading-relaxed text-muted ${
            align === "right" ? "right-0" : "left-0"
          }`}
          style={{ boxShadow: "var(--elevation-3)" }}
        >
          {message}
        </div>
      )}
    </div>
  );
}
