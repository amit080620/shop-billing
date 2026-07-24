"use client";

import { useRouter } from "next/navigation";
import type { Lang } from "./dictionary";

export function LanguageToggle({ lang, compact = false }: { lang: Lang; compact?: boolean }) {
  const router = useRouter();

  function switchTo(next: Lang) {
    document.cookie = `lang=${next}; path=/; max-age=31536000`;
    router.refresh();
  }

  return (
    <div className={`flex gap-1.5 ${compact ? "" : "rounded-lg border border-border p-1"}`}>
      <button
        onClick={() => switchTo("en")}
        className={`rounded-md px-2.5 py-1 text-xs font-medium ${
          lang === "en" ? "bg-brand-soft text-brand-dark" : "text-muted"
        }`}
      >
        English
      </button>
      <button
        onClick={() => switchTo("hi")}
        className={`rounded-md px-2.5 py-1 text-xs font-medium ${
          lang === "hi" ? "bg-brand-soft text-brand-dark" : "text-muted"
        }`}
      >
        हिंदी
      </button>
    </div>
  );
}
