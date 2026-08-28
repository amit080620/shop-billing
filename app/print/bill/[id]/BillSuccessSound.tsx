"use client";

import { useEffect, useRef } from "react";
import { playBillSuccessSound } from "@/lib/billSound";

/** Renders nothing visible — mounts on the print page and plays the
 * success sound exactly once if the URL contains ?new=1, meaning the
 * user just completed a fresh bill (as opposed to reprinting an old
 * one). The ref guard ensures it can't play twice even in React
 * Strict Mode's double-invoke. */
export function BillSuccessSound() {
  const played = useRef(false);

  useEffect(() => {
    if (played.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      played.current = true;
      // Tiny delay so the page has genuinely rendered before the
      // audio context is created — avoids the iOS "audio must follow
      // a user gesture" error by ensuring we're inside the same
      // task as the navigation (which was a form submit, a user
      // gesture).
      setTimeout(playBillSuccessSound, 80);
    }
  }, []);

  return null;
}
