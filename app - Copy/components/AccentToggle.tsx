"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AccentToggle({ accent: initial }: { accent: "blue" | "saffron" | "gray" }) {
  const router = useRouter();
  const [accent, setAccent] = useState(initial);

  function switchTo(next: "blue" | "saffron" | "gray") {
    setAccent(next);
    document.cookie = `accent=${next}; path=/; max-age=31536000`;
    document.documentElement.setAttribute("data-accent", next);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border border-border p-1">
      <button
        onClick={() => switchTo("blue")}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
          accent === "blue" ? "bg-brand-soft text-brand-text" : "text-muted"
        }`}
        style={accent === "blue" ? { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" } : undefined}
      >
        <span className="h-3 w-3 rounded-full" style={{ background: "#0427f3" }} />
        Blue
      </button>
      <button
        onClick={() => switchTo("saffron")}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
          accent === "saffron" ? "bg-brand-soft text-brand-text" : "text-muted"
        }`}
        style={accent === "saffron" ? { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" } : undefined}
      >
        <span className="h-3 w-3 rounded-full" style={{ background: "#e8720e" }} />
        Saffron
      </button>
      <button
        onClick={() => switchTo("gray")}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
          accent === "gray" ? "bg-brand-soft text-brand-text" : "text-muted"
        }`}
        style={accent === "gray" ? { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" } : undefined}
      >
        <span className="h-3 w-3 rounded-full" style={{ background: "#475569" }} />
        Gray
      </button>
    </div>
  );
}
