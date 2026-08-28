"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveKdsSettingsAction } from "@/lib/actions/restaurant";
import { PageHeader } from "@/app/components/PageHeader";
import { Monitor, Check } from "lucide-react";

export function KdsSettingsClient({ columns: initialColumns, fontScale: initialFontScale }: { columns: number; fontScale: "normal" | "large" | "extra_large" }) {
  const router = useRouter();
  const [columns, setColumns] = useState(initialColumns);
  const [fontScale, setFontScale] = useState<"normal" | "large" | "extra_large">(initialFontScale);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(nextColumns: number, nextFontScale: "normal" | "large" | "extra_large") {
    startTransition(async () => {
      const result = await saveKdsSettingsAction(nextColumns, nextFontScale);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Kitchen display settings"
        subtitle="How tickets show on the KDS TV/screen — bigger, bolder text helps if it's mounted far from the line."
        icon={<Monitor size={18} strokeWidth={1.8} />}
      />
      <Link href="/restaurant-kds" target="_blank" className="flex items-center gap-1 text-sm text-brand">
        <Monitor size={14} /> Open KDS screen in a new tab
      </Link>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Cards per row</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => {
                setColumns(n);
                save(n, fontScale);
              }}
              disabled={isPending}
              className={`flex-1 rounded-lg border py-3 text-center text-sm font-semibold disabled:opacity-60 ${
                columns === n ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
              }`}
              style={
                columns === n
                  ? { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }
                  : undefined
              }
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">Fewer cards per row = each one is bigger and easier to read from a distance.</p>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Text size</p>
        <div className="flex gap-2">
          {(
            [
              { value: "normal", label: "Normal" },
              { value: "large", label: "Large" },
              { value: "extra_large", label: "Extra large" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                setFontScale(opt.value);
                save(columns, opt.value);
              }}
              disabled={isPending}
              className={`flex-1 rounded-lg border py-3 text-center text-sm font-semibold disabled:opacity-60 ${
                fontScale === opt.value ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
              }`}
              style={
                fontScale === opt.value
                  ? { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }
                  : undefined
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {saved && <p className="flex items-center gap-1 text-sm text-brand-text"><Check size={13} /> Saved — refresh the KDS screen to see the change.</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
