"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AssistantToggle({ enabled: initial }: { enabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial);

  function switchTo(next: boolean) {
    setEnabled(next);
    document.cookie = `assistant=${next ? "on" : "off"}; path=/; max-age=31536000`;
    router.refresh();
  }

  return (
    <div className="flex gap-1.5 rounded-lg border border-border p-1">
      <button
        onClick={() => switchTo(true)}
        className={`rounded-md px-2.5 py-1 text-xs font-medium ${enabled ? "bg-brand-soft text-brand-text" : "text-muted"}`}
        style={enabled ? { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" } : undefined}
      >
        On
      </button>
      <button
        onClick={() => switchTo(false)}
        className={`rounded-md px-2.5 py-1 text-xs font-medium ${!enabled ? "bg-brand-soft text-brand-text" : "text-muted"}`}
        style={!enabled ? { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" } : undefined}
      >
        Off
      </button>
    </div>
  );
}
