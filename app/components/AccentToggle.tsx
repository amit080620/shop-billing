"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Accent = "blue" | "copper" | "gold" | "purple" | "coral";

const ACCENTS: { value: Accent; label: string; swatch: string }[] = [
  { value: "blue", label: "Blue", swatch: "#0427f3" },
  { value: "copper", label: "Copper", swatch: "linear-gradient(135deg, #e8ae95 0%, #c47a61 45%, #8f5140 100%)" },
  { value: "gold", label: "Gold", swatch: "linear-gradient(135deg, #fbe9a0 0%, #f2b84f 45%, #d87520 100%)" },
  { value: "purple", label: "Purple", swatch: "linear-gradient(135deg, #cc82e8 0%, #874fd0 45%, #4b2fa8 100%)" },
  { value: "coral", label: "Coral", swatch: "linear-gradient(135deg, #ffaa83 0%, #f66a4d 45%, #e22f24 100%)" },
];

export function AccentToggle({ accent: initial }: { accent: Accent }) {
  const router = useRouter();
  const [accent, setAccent] = useState(initial);

  function switchTo(next: Accent) {
    setAccent(next);
    document.cookie = `accent=${next}; path=/; max-age=31536000`;
    document.documentElement.setAttribute("data-accent", next);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border border-border p-1">
      {ACCENTS.map((a) => (
        <button
          key={a.value}
          onClick={() => switchTo(a.value)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
            accent === a.value ? "bg-brand-soft text-brand-text" : "text-muted"
          }`}
          style={accent === a.value ? { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" } : undefined}
        >
          <span className="h-3 w-3 rounded-full" style={{ background: a.swatch }} />
          {a.label}
        </button>
      ))}
    </div>
  );
}
