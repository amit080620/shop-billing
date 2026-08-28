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
 * one of those bars. This does it explicitly instead: on focus, wait
 * for the on-screen keyboard's open animation to finish, then scroll
 * the field to the center of whatever viewport space is actually left
 * (the CSS scroll-margin-* rules in globals.css keep it clear of the
 * fixed nav/header too).
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
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 300);
    }

    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  return null;
}
