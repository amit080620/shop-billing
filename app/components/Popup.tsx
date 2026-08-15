"use client";

import { useEffect, useRef } from "react";

/**
 * Standard popup used for every "add/edit" flow across the app —
 * bottom-sheet on mobile, centered dialog on desktop.
 *
 * - 3D-style elevated shadow (var(--elevation-4)) instead of a flat
 *   border, matching the Design OS's "soft 3D" direction.
 * - ray-pop entrance animation from the motion library.
 * - Keyboard-safe: when a field inside gets focus (the on-screen
 *   keyboard opens on mobile), the popup scrolls that field into view
 *   above the keyboard automatically instead of leaving it hidden.
 */
export function Popup({
  open,
  onClose,
  title,
  children,
  maxWidthClassName = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidthClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    // When any input/textarea/select inside the popup gets focus (the
    // keyboard is about to open on mobile), scroll it into view after
    // a short delay — long enough for the keyboard animation to finish
    // resizing the viewport, so the field lands above the keyboard
    // instead of being covered by it.
    function onFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement;
      if (!target || !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      setTimeout(() => {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 250);
    }
    panel.addEventListener("focusin", onFocusIn);
    return () => panel.removeEventListener("focusin", onFocusIn);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className={`ray-pop flex max-h-[85vh] w-full ${maxWidthClassName} flex-col overflow-y-auto rounded-t-2xl bg-surface p-4 sm:rounded-2xl`}
        style={{ boxShadow: "var(--elevation-4)" }}
      >
        {title && <p className="mb-3 text-sm font-semibold text-foreground">{title}</p>}
        {children}
      </div>
    </div>
  );
}
