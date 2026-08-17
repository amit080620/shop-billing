"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const OPTIONS: { value: "default" | "navy" | "charcoal" | "slate"; label: string; swatch: string }[] = [
  { value: "default", label: "Black", swatch: "#373435" },
  { value: "navy", label: "Navy", swatch: "#1e293b" },
  { value: "charcoal", label: "Charcoal", swatch: "#292524" },
  { value: "slate", label: "Slate", swatch: "#334155" },
];

export function TextColorToggle({ textColor: initial }: { textColor: "default" | "navy" | "charcoal" | "slate" }) {
  const router = useRouter();
  const [textColor, setTextColor] = useState(initial);

  function switchTo(next: "default" | "navy" | "charcoal" | "slate") {
    setTextColor(next);
    document.cookie = `textColor=${next}; path=/; max-age=31536000`;
    document.documentElement.setAttribute("data-text", next);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border border-border p-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => switchTo(opt.value)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
            textColor === opt.value ? "bg-brand-soft text-brand-text" : "text-muted"
          }`}
          style={textColor === opt.value ? { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" } : undefined}
        >
          <span className="h-3 w-3 rounded-full" style={{ background: opt.swatch }} />
          {opt.label}
        </button>
      ))}
    </div>
  );
}
