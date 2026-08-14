"use client";

import { useRouter } from "next/navigation";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle({ theme, compact = false }: { theme: "light" | "dark"; compact?: boolean }) {
  const router = useRouter();

  function switchTo(next: "light" | "dark") {
    document.cookie = `theme=${next}; path=/; max-age=31536000`;
    document.documentElement.classList.toggle("dark", next === "dark");
    router.refresh();
  }

  return (
    <div className={`flex gap-1.5 ${compact ? "" : "rounded-lg border border-border p-1"}`}>
      <button
        onClick={() => switchTo("light")}
        className={`rounded-md px-2.5 py-1 text-xs font-medium ${
          theme === "light" ? "bg-brand-soft text-brand-dark" : "text-muted"
        }`}
      >
        <Sun size={12} className="inline" /> Light
      </button>
      <button
        onClick={() => switchTo("dark")}
        className={`rounded-md px-2.5 py-1 text-xs font-medium ${
          theme === "dark" ? "bg-brand-soft text-brand-dark" : "text-muted"
        }`}
      >
        <Moon size={12} className="inline" /> Dark
      </button>
    </div>
  );
}
