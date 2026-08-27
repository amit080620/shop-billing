"use client";

import { useState, useTransition } from "react";
import { saveBarcodeScanModeAction } from "@/lib/actions/settings";
import { Camera, Keyboard, Layers } from "lucide-react";

const OPTIONS = [
  { value: "both" as const, label: "Both", icon: Layers, sub: "Show both — camera and type-to-scan" },
  { value: "camera" as const, label: "Camera only", icon: Camera, sub: "Scan visually with your phone's camera" },
  { value: "hardware" as const, label: "Hardware scanner only", icon: Keyboard, sub: "A laser scanner types the code and presses Enter" },
];

export function BarcodeScanModeToggle({ initial }: { initial: "camera" | "hardware" | "both" }) {
  const [mode, setMode] = useState(initial);
  const [isPending, startTransition] = useTransition();

  function select(next: "camera" | "hardware" | "both") {
    setMode(next);
    startTransition(async () => {
      await saveBarcodeScanModeAction(next);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => select(opt.value)}
            disabled={isPending}
            className={`flex items-center gap-3 rounded-xl border p-3 text-left transition disabled:opacity-60 ${
              active ? "border-brand bg-brand-soft" : "border-border bg-surface"
            }`}
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? "bg-brand text-white" : "bg-background text-muted"}`}>
              <Icon size={16} strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${active ? "text-brand-text" : "text-foreground"}`}>{opt.label}</p>
              <p className="text-xs text-muted">{opt.sub}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
