"use client";

import { useState, useTransition } from "react";
import { Palette } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";
import { setUiVersionAction } from "@/lib/actions/uiVersion";

type Look = "classic" | "new";

/** Preferences → App look (testing): Classic or the New design, shown only to shops on the
 * New-look allowlist (lib/uiVersion). Switching reloads the app so every screen takes the look. */
export function UiVersionToggle({ version: initial }: { version: Look }) {
  const { t } = useT();
  const [version, setVersion] = useState<Look>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(next: Look) {
    if (next === version || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await setUiVersionAction(next).catch(() => ({ error: "Couldn't switch the look — try again." }));
      if (res.error) {
        setError(res.error);
        return;
      }
      setVersion(next);
      window.location.reload();
    });
  }

  const options: { value: Look; label: string }[] = [
    { value: "classic", label: t("Classic") },
    { value: "new", label: t("New look") },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface p-3">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${version === "new" ? "bg-brand text-white" : "bg-background text-muted"}`}>
          <Palette size={16} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{t("App look (testing)")}</p>
          <p className="text-xs text-muted">{t("Only shops chosen to try the new design see this. Billing, stock and accounts work the same in both looks.")}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface-2 p-1" role="group" aria-label={t("App look (testing)")}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={version === o.value}
            disabled={pending}
            onClick={() => choose(o.value)}
            className={`rounded-lg py-2 text-sm font-semibold ${version === o.value ? "bg-brand text-white" : "text-muted hover:text-foreground"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">{t("Training videos show the Classic look. Switching reloads the app on this device.")}</p>
      {error && <p className="text-xs text-danger">{t(error)}</p>}
    </div>
  );
}
