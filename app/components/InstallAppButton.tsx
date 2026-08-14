"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

/** Chrome's automatic "Add to Home Screen" banner fires on its own
 * engagement heuristics (visit count, time on site) that are outside our
 * control, and iOS Safari never fires beforeinstallprompt at all — it
 * has no such API. Relying purely on that event means the install path
 * silently disappears for a large share of visitors. This always shows
 * SOMETHING: the one-tap flow when the browser offers it, otherwise
 * platform-specific manual steps that are guaranteed to work. */
export function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [showManualSteps, setShowManualSteps] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as { standalone?: boolean }).standalone) {
      setInstalled(true);
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onAppInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (installed) return null;

  async function handleClick() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }
    setShowManualSteps((v) => !v);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleClick}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-text"
      >
        Install app on this device
      </button>

      {showManualSteps && !deferredPrompt && (
        <div className="rounded-lg border border-border bg-surface p-3 text-xs text-foreground">
          {platform === "ios" ? (
            <ol className="flex flex-col gap-1.5 list-decimal pl-4">
              <li>Tap the Share button (⬆️) at the bottom of Safari</li>
              <li>Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong></li>
              <li>Tap <strong>&quot;Add&quot;</strong> in the top right</li>
            </ol>
          ) : platform === "android" ? (
            <ol className="flex flex-col gap-1.5 list-decimal pl-4">
              <li>Tap the ⋮ menu (top right of Chrome)</li>
              <li>Tap <strong>&quot;Add to Home screen&quot;</strong> or <strong>&quot;Install app&quot;</strong></li>
              <li>Confirm by tapping <strong>&quot;Add&quot;</strong> / <strong>&quot;Install&quot;</strong></li>
            </ol>
          ) : (
            <ol className="flex flex-col gap-1.5 list-decimal pl-4">
              <li>Look for an install icon (⊕ or a monitor icon) in the address bar</li>
              <li>Click it, then confirm <strong>&quot;Install&quot;</strong></li>
              <li>Or open the browser menu → <strong>&quot;Install [app name]&quot;</strong></li>
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
