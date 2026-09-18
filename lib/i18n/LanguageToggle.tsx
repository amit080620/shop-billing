"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Lang } from "./dictionary";

const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिंदी" },
  { code: "mr", label: "मराठी" },
];

export function LanguageToggle({ lang: initial }: { lang: Lang; /** Kept for call-site compatibility; the control has one look now. */ compact?: boolean }) {
  const router = useRouter();
  const [lang, setLang] = useState(initial);

  function switchTo(next: Lang) {
    setLang(next);
    document.cookie = `lang=${next}; path=/; max-age=31536000`;
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-0.5 rounded-lg border border-border bg-surface p-0.5">
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => switchTo(l.code)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
            lang === l.code ? "bg-brand-soft font-semibold text-brand-text" : "text-muted hover:text-foreground"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
