"use client";

import { useEffect } from "react";

const FOCUSABLE_SELECTOR = "input, textarea, select, [contenteditable='true']";
const SKIP_TYPES = new Set(["checkbox", "radio"]);

/**
 * Mounted once in the root layout so it applies to EVERY field on
 * EVERY screen — dashboard forms across all business types, auth
 * pages, popups, everything — without needing to touch each form
 * individually.
 *
 * Mobile browsers "sort of" scroll a focused field into view on their
 * own, but that native behavior doesn't know about this app's own
 * fixed bottom nav or sticky header sitting on top of the content, so
 * a field can end up focused but still hidden behind the keyboard or
 * one of those bars. This does it explicitly instead.
 *
 * Deliberately does NOT use scrollIntoView's block:"center" — a huge
 * share of fields in this app (product search, customer search,
 * autocomplete inputs) open a suggestion dropdown BELOW themselves.
 * Centering the field puts that dropdown in the bottom half of the
 * visible area, right where the keyboard is, hiding it. Instead this
 * positions the field near the TOP of whatever space is left above
 * the keyboard, leaving the room below free for a dropdown to render
 * into.
 */
export function FocusScrollIntoView() {
  useEffect(() => {
    function onFocusIn(e: FocusEvent) {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches(FOCUSABLE_SELECTOR)) return;
      if (target instanceof HTMLInputElement && SKIP_TYPES.has(target.type)) return;

      // The virtual keyboard animates open over ~200-300ms; scrolling
      // immediately measures the viewport BEFORE it's shrunk, landing
      // the field in the wrong place. Waiting lets visualViewport
      // settle first.
      window.setTimeout(() => {
        const el = target;
        const rect = el.getBoundingClientRect();
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

        // Target: field's top sits ~18% down from the top of the
        // visible (post-keyboard) viewport, clearing the sticky
        // header and leaving the rest of the space free for a
        // dropdown/suggestion list to open into.
        const targetTop = viewportHeight * 0.18;
        const delta = rect.top - targetTop;

        // Already close enough — don't fight the browser's own
        // native scroll-on-focus for a few pixels of difference.
        if (Math.abs(delta) < 24) return;

        window.scrollBy({ top: delta, behavior: "smooth" });
      }, 300);
    }

    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  return null;
}
