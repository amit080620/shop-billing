"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

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

const DISMISS_KEY = "installPromptDismissedUntil";
// Genuinely comes back after a while, rather than being gone forever —
// someone's circumstances change (e.g. they get a dedicated work
// phone), but it should NEVER nag on every single visit like before.
const DISMISS_DAYS = 14;

/** Chrome's automatic "Add to Home Screen" banner fires on its own
 * engagement heuristics (visit count, time on site) that are outside our
 * control, and iOS Safari never fires beforeinstallprompt at all — it
 * has no such API. Relying purely on that event means the install path
 * silently disappears for a large share of visitors. This always shows
 * SOMETHING: the one-tap flow when the browser offers it, otherwise
 * platform-specific manual steps that are guaranteed to work.
 *
 * Genuinely remembers a "not now" — this used to show unconditionally
 * on every visit with no way to dismiss it, which is genuinely just
 * nagging. A real PWA install has genuine value for an app opened
 * dozens of times a day (faster launch, no browser chrome eating
 * screen space, better offline behaviour) — the fix for a naggy
 * prompt is to make it respectful, not to remove the value entirely. */
export function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [showManualSteps, setShowManualSteps] = useState(false);
  const [dismissed, setDismissed] = useState(true); // genuinely start hidden until the localStorage check below resolves, avoiding a flash

  useEffect(() => {
    setPlatform(detectPlatform());
    if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as { standalone?: boolean }).standalone) {
      setInstalled(true);
    }

    const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    setDismissed(Date.now() < dismissedUntil);

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

  if (installed || dismissed) return null;

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000));
    setDismissed(true);
  }

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
      <div className="flex items-center gap-2">
        <button
          onClick={handleClick}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-brand bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-text"
          style={{ boxShadow: "-4px -4px 10px var(--neu-light), 4px 4px 10px var(--neu-dark)" }}
        >
          Install app on this device
        </button>
        <button
          onClick={handleDismiss}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted"
          style={{ boxShadow: "-3px -3px 7px var(--neu-light), 3px 3px 7px var(--neu-dark)" }}
          aria-label="Not now"
        >
          <X size={16} />
        </button>
      </div>

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
