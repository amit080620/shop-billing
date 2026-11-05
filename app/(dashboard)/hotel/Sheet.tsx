"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";

/** A bottom sheet on phones, a centred card on larger screens. It closes only from its ✕ (or Esc),
 * and asks first when something has been typed, so a stray tap beside it loses nothing. */
export function Sheet({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const { t } = useT();
  const typed = useRef(false);
  const close = useRef(() => {});
  close.current = () => {
    if (!typed.current || confirm(t("Close without saving what you typed?"))) onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div
        role="dialog"
        aria-label={title}
        onInput={() => {
          typed.current = true;
        }}
        className={`flex max-h-[90vh] max-h-[90dvh] w-full flex-col gap-3 overflow-y-auto overscroll-contain rounded-t-2xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl ${wide ? "max-w-lg" : "max-w-md"}`}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button type="button" onClick={() => close.current()} aria-label="Close" className="-mr-1 -mt-1 rounded-full p-1.5 text-muted hover:bg-surface-2">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
