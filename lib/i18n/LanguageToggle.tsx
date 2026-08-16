"use client";

import { useRouter } from "next/navigation";
import type { Lang } from "./dictionary";

const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिंदी" },
  { code: "mr", label: "मराठी" },
];

export function LanguageToggle({ lang, compact = false }: { lang: Lang; compact?: boolean }) {
  const router = useRouter();

  function switchTo(next: Lang) {
    document.cookie = `lang=${next}; path=/; max-age=31536000`;
    router.refresh();
  }

  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? "" : "rounded-lg border border-border p-1"}`}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => switchTo(l.code)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
            lang === l.code ? "bg-brand-soft text-brand-dark" : "text-muted"
          }`}
          style={
            lang === l.code
              ? { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }
              : undefined
          }
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
