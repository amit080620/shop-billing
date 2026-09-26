"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/** A bottom sheet on phones, a centred card on larger screens. */
export function Sheet({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className={`flex max-h-[90vh] w-full flex-col gap-3 overflow-y-auto rounded-t-2xl bg-surface p-5 sm:rounded-2xl ${wide ? "max-w-lg" : "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 rounded-full p-1.5 text-muted hover:bg-surface-2">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
