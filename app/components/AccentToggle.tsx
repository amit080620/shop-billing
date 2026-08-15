"use client";

import { useRouter } from "next/navigation";

export function AccentToggle({ accent }: { accent: "blue" | "saffron" }) {
  const router = useRouter();

  function switchTo(next: "blue" | "saffron") {
    document.cookie = `accent=${next}; path=/; max-age=31536000`;
    document.documentElement.setAttribute("data-accent", next);
    router.refresh();
  }

  return (
    <div className="flex gap-1.5 rounded-lg border border-border p-1">
      <button
        onClick={() => switchTo("blue")}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
          accent === "blue" ? "bg-brand-soft text-brand-text" : "text-muted"
        }`}
      >
        <span className="h-3 w-3 rounded-full" style={{ background: "#0427f3" }} />
        Blue
      </button>
      <button
        onClick={() => switchTo("saffron")}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
          accent === "saffron" ? "bg-brand-soft text-brand-text" : "text-muted"
        }`}
      >
        <span className="h-3 w-3 rounded-full" style={{ background: "#e8720e" }} />
        Saffron
      </button>
    </div>
  );
}
