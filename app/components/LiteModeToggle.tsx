"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Sparkles } from "lucide-react";

/** Applies the lite-mode class to <html> on first load, matching
 * whatever was saved in the cookie — mirrors AutoThemeApplier's
 * pattern exactly. */
export function LiteModeApplier({ enabled }: { enabled: boolean }) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("lite-mode", enabled);
  }
  return null;
}

export function LiteModeToggle({ enabled: initial }: { enabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    document.cookie = `lite_mode=${next ? "on" : "off"}; path=/; max-age=31536000`;
    document.documentElement.classList.toggle("lite-mode", next);
    router.refresh();
  }

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
        enabled ? "border-brand bg-brand-soft" : "border-border bg-surface"
      }`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${enabled ? "bg-brand text-white" : "bg-background text-muted"}`}>
        {enabled ? <Zap size={16} strokeWidth={1.8} /> : <Sparkles size={16} strokeWidth={1.8} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${enabled ? "text-brand-text" : "text-foreground"}`}>{enabled ? "Lite Mode: ON" : "Lite Mode: OFF"}</p>
        <p className="text-xs text-muted">
          {enabled ? "Flat, simple cards — faster on older phones" : "Premium look — tap to switch to a faster, simpler look"}
        </p>
      </div>
    </button>
  );
}
