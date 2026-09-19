"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sun, Moon, SunMoon } from "lucide-react";

/** Genuinely day between 6am and 6pm local time, night otherwise —
 * simple, predictable, and matches how most people would describe
 * "day" vs "night" without needing sunrise/sunset lookups. */
function isDaytimeNow(): boolean {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18;
}

function applyDarkClass(isDark: boolean) {
  document.documentElement.classList.toggle("dark", isDark);
}

/** Genuinely applies the correct light/dark class for "auto" mode
 * right now, and re-checks periodically so a long-open tab genuinely
 * flips over at the actual day/night boundary rather than staying
 * stuck on whatever it was when the page first loaded. */
export function AutoThemeApplier({ theme }: { theme: "light" | "dark" | "auto" }) {
  useEffect(() => {
    if (theme !== "auto") return;
    applyDarkClass(!isDaytimeNow());
    const interval = setInterval(() => applyDarkClass(!isDaytimeNow()), 60_000);
    return () => clearInterval(interval);
  }, [theme]);

  return null;
}

export function ThemeToggle({ theme: initial }: { theme: "light" | "dark" | "auto"; /** Kept for call-site compatibility; the control has one look now. */ compact?: boolean }) {
  const router = useRouter();
  const [theme, setTheme] = useState(initial);

  function switchTo(next: "light" | "dark" | "auto") {
    setTheme(next);
    document.cookie = `theme=${next}; path=/; max-age=31536000`;
    if (next === "auto") applyDarkClass(!isDaytimeNow());
    else applyDarkClass(next === "dark");
    router.refresh();
  }

  return (
    <div className="flex shrink-0 gap-0.5 rounded-lg border border-border bg-surface p-0.5">
      <button
        onClick={() => switchTo("light")}
        className={`rounded-md px-2.5 py-1 text-xs font-medium ${
          theme === "light" ? "bg-brand-soft text-brand-text" : "text-muted"
        }`}
      >
        <Sun size={12} className="inline" /> Light
      </button>
      <button
        onClick={() => switchTo("dark")}
        className={`rounded-md px-2.5 py-1 text-xs font-medium ${
          theme === "dark" ? "bg-brand-soft text-brand-text" : "text-muted"
        }`}
      >
        <Moon size={12} className="inline" /> Dark
      </button>
      <button
        onClick={() => switchTo("auto")}
        className={`rounded-md px-2.5 py-1 text-xs font-medium ${
          theme === "auto" ? "bg-brand-soft text-brand-text" : "text-muted"
        }`}
        title="Switches with day and night automatically"
      >
        <SunMoon size={12} className="inline" /> Auto
      </button>
    </div>
  );
}
