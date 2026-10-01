"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";

type Setting = "auto" | "on" | "off";

/** Applies the lite-mode class to <html> on first load, matching
 * whatever was saved in the cookie — mirrors AutoThemeApplier's
 * pattern exactly. */
export function LiteModeApplier({ enabled }: { enabled: boolean }) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("lite-mode", enabled);
  }
  return null;
}

/** Lite Mode: Auto (on for older phones and slow internet — the default), always On, or Off. */
export function LiteModeToggle({ setting: initial }: { setting: Setting }) {
  const { t } = useT();
  const router = useRouter();
  const [setting, setSetting] = useState<Setting>(initial);
  const [active, setActive] = useState<boolean | null>(null);

  useEffect(() => {
    setActive(document.documentElement.classList.contains("lite-mode"));
  }, [setting]);

  function choose(next: Setting) {
    setSetting(next);
    if (next === "auto") {
      document.cookie = "lite_mode=; path=/; max-age=0";
      // Same check as the root layout's script.
      const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };
      const c = n.connection ?? {};
      const on = (n.deviceMemory ?? 8) <= 2 || (n.hardwareConcurrency ?? 8) <= 4 || !!c.saveData || /2g|3g/.test(c.effectiveType ?? "");
      document.cookie = `lite_auto=${on ? "1" : "0"}; path=/; max-age=2592000; samesite=lax`;
      document.documentElement.classList.toggle("lite-mode", on);
    } else {
      document.cookie = `lite_mode=${next}; path=/; max-age=31536000`;
      document.documentElement.classList.toggle("lite-mode", next === "on");
    }
    setActive(document.documentElement.classList.contains("lite-mode"));
    router.refresh();
  }

  const options: { value: Setting; label: string }[] = [
    { value: "auto", label: t("Auto") },
    { value: "on", label: t("On") },
    { value: "off", label: t("Off") },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface p-3">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? "bg-brand text-white" : "bg-background text-muted"}`}>
          <Zap size={16} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{t("Lite Mode — fastest on old phones")}</p>
          <p className="text-xs text-muted">{t("No animations, shadows, blur or sounds, the phone's own font, simple charts. Billing works exactly the same, just quicker.")}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface-2 p-1" role="group" aria-label={t("Lite Mode")}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={setting === o.value}
            onClick={() => choose(o.value)}
            className={`rounded-lg py-2 text-sm font-semibold ${setting === o.value ? "bg-brand text-white" : "text-muted hover:text-foreground"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {active !== null && (
        <p className="text-xs text-muted">
          {setting === "auto" ? (active ? t("Auto: this phone gets Lite Mode (older phone or slow internet).") : t("Auto: this phone is fast enough for the full look.")) : active ? t("Lite Mode is on.") : t("Lite Mode is off.")}
        </p>
      )}
    </div>
  );
}
