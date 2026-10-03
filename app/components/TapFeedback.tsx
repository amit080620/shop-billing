"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// If no new screen has come by then, the line goes away anyway (a link handled on the same screen).
const MAX_SHOW_MS = 10_000;

/** A thin line across the top the instant a link to another screen is tapped, until that screen
 * shows its content. On a weak 4G connection a request can hang for seconds before anything comes
 * back; without this the app looked frozen and the tap unregistered, so people tapped again. Pure
 * CSS on the phone, nothing fetched; in Lite Mode a plain line without animation. Forms show their
 * own "Saving…" state, so they are left alone. */
export function TapFeedback() {
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const tap = useRef({ at: 0, from: "" });

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      tap.current = { at: Date.now(), from: location.pathname };
      setBusy(true);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Hidden once the app is on another screen and that screen's loading outline is gone.
  useEffect(() => {
    if (!busy) return;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const arrived = location.pathname !== tap.current.from && !document.querySelector("[data-loading-screen]");
      if (arrived || Date.now() - tap.current.at > MAX_SHOW_MS) setBusy(false);
      else timer = setTimeout(check, 80);
    };
    check();
    return () => clearTimeout(timer);
  }, [pathname, busy]);

  if (!busy) return null;
  return <div className="tap-feedback" role="progressbar" aria-label="Loading" />;
}
