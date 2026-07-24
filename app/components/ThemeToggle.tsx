"use client";

import { useRouter } from "next/navigation";

export function ThemeToggle({ theme }: { theme: "light" | "dark" }) {
  const router = useRouter();

  function switchTo(next: "light" | "dark") {
    document.cookie = `theme=${next}; path=/; max-age=31536000`;
    document.documentElement.classList.toggle("dark", next === "dark");
    router.refresh();
  }

  return (
    <div className="flex gap-1.5 rounded-lg border border-border p-1">
      <button
        onClick={() => switchTo("light")}
        className={`rounded-md px-2.5 py-1 text-xs font-medium ${
          theme === "light" ? "bg-brand-soft text-brand-dark" : "text-muted"
        }`}
      >
        ☀️ Light
      </button>
      <button
        onClick={() => switchTo("dark")}
        className={`rounded-md px-2.5 py-1 text-xs font-medium ${
          theme === "dark" ? "bg-brand-soft text-brand-dark" : "text-muted"
        }`}
      >
        🌙 Dark
      </button>
    </div>
  );
}
