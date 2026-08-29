"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = "input, textarea, select, [contenteditable='true']";
const SKIP_TYPES = new Set(["checkbox", "radio"]);
// How long the viewport must stop changing before we act — this is
// what makes the timing itself accurate instead of guessed. Keyboards
// open at different speeds on different devices/OSes; a fixed delay
// is either too slow (feels sluggish on a fast device) or too fast
// (fires before a slower keyboard has finished animating, landing the
// field in the wrong place — exactly the "sometimes right, sometimes
// not" inconsistency this replaces).
const SETTLE_MS = 60;
// Only used as a last resort on browsers with no visualViewport API
// at all (very old browsers) — everything else uses the real event.
const FALLBACK_DELAY_MS = 350;

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
 * one of those bars. This does it explicitly instead — and does so by
 * listening to the keyboard's OWN resize event rather than a fixed
 * timer, so it reacts at the exact moment the viewport genuinely
 * finishes changing on that specific device.
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
  const activeRef = useRef<HTMLElement | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function positionField(el: HTMLElement) {
      // The field may have lost focus, or been removed from the DOM
      // (e.g. a popup closed), by the time this actually fires —
      // never scroll based on stale state.
      if (!el.isConnected || document.activeElement !== el) return;

      const rect = el.getBoundingClientRect();
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

      // Target: field's top sits ~18% down from the top of the
      // visible (post-keyboard) viewport, clearing the sticky header
      // and leaving the rest of the space free for a dropdown to
      // render into.
      const targetTop = viewportHeight * 0.18;
      const delta = rect.top - targetTop;

      // Already close enough — don't fight the browser's own native
      // scroll-on-focus for a few pixels of difference.
      if (Math.abs(delta) < 24) return;

      window.scrollBy({ top: delta, behavior: "smooth" });
    }

    // Re-armed on every viewport resize event — a keyboard opening is
    // usually several resize events in quick succession (animating),
    // not one clean jump. Only acting once they stop for SETTLE_MS
    // means we always compute against the FINAL, accurate height,
    // not an intermediate one mid-animation.
    function scheduleSettleCheck() {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        if (activeRef.current) positionField(activeRef.current);
      }, SETTLE_MS);
    }

    function onFocusIn(e: FocusEvent) {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches(FOCUSABLE_SELECTOR)) return;
      if (target instanceof HTMLInputElement && SKIP_TYPES.has(target.type)) return;

      activeRef.current = target;

      if (window.visualViewport) {
        scheduleSettleCheck();
      } else {
        window.setTimeout(() => positionField(target), FALLBACK_DELAY_MS);
      }
    }

    function onFocusOut() {
      activeRef.current = null;
    }

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.visualViewport?.addEventListener("resize", scheduleSettleCheck);

    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.visualViewport?.removeEventListener("resize", scheduleSettleCheck);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, []);

  return null;
}
