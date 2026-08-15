"use client";

import { useEffect, useState } from "react";

/** navigator.onLine only reflects whether the OS thinks SOME network
 * interface is up — it's well known to misreport on Windows (Wi-Fi
 * driver quirks, certain routers, firewall/antivirus network detection)
 * even when the internet genuinely works fine. A real fetch is the only
 * way to know for certain, so that's the source of truth here;
 * navigator.onLine is only used to react instantly to an actual
 * disconnect/reconnect event rather than waiting for the next poll. */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkRealConnectivity() {
      try {
        // No-cors + a tiny public endpoint: we only care whether the
        // request resolves at all, not its content — any response (even
        // an opaque one) means the network path out to the internet is
        // actually working.
        await fetch("https://www.gstatic.com/generate_204", { mode: "no-cors", cache: "no-store" });
        if (!cancelled) setIsOnline(true);
      } catch {
        if (!cancelled) setIsOnline(false);
      }
    }

    checkRealConnectivity();
    const interval = setInterval(checkRealConnectivity, 15000);

    // React instantly to the browser's own online/offline events too —
    // but always follow up with a real check rather than trusting them
    // outright, since going "online" per the OS doesn't guarantee the
    // internet path actually works yet.
    function onOnline() {
      checkRealConnectivity();
    }
    function onOffline() {
      setIsOnline(false);
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return isOnline;
}
