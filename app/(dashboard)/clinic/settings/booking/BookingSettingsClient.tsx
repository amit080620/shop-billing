"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveBookingSettingsAction, type WorkingHours } from "@/lib/actions/clinic";
import { PageHeader } from "@/app/components/PageHeader";

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

export function BookingSettingsClient({
  slotDurationMinutes: initialSlotDuration,
  workingHours: initialHours,
  isPublicBookingEnabled: initialEnabled,
  publicToken,
  businessType,
}: {
  slotDurationMinutes: number;
  workingHours: WorkingHours;
  isPublicBookingEnabled: boolean;
  publicToken: string | null;
  businessType: string;
}) {
  const router = useRouter();
  const [slotDuration, setSlotDuration] = useState(initialSlotDuration);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [hours, setHours] = useState<WorkingHours>(initialHours);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const backLink = businessType === "salon" ? "/salon" : "/clinic";
  const noun = businessType === "salon" ? "customer" : "patient";

  function dayRanges(key: string) {
    return hours[key] ?? [];
  }
  function toggleDay(key: string) {
    setHours((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = [{ start: "10:00", end: "18:00" }];
      return next;
    });
  }
  function updateRange(key: string, index: number, patch: Partial<{ start: string; end: string }>) {
    setHours((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }));
  }
  function addRange(key: string) {
    setHours((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), { start: "18:00", end: "21:00" }] }));
  }
  function removeRange(key: string, index: number) {
    setHours((prev) => ({ ...prev, [key]: (prev[key] ?? []).filter((_, i) => i !== index) }));
  }

  function save() {
    setSaved(false);
    startTransition(async () => {
      const result = await saveBookingSettingsAction({ slotDurationMinutes: slotDuration, workingHours: hours, isPublicBookingEnabled: enabled });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setSaved(true);
      router.refresh();
    });
  }

  const publicUrl = publicToken && typeof window !== "undefined" ? `${window.location.origin}/book/${publicToken}` : null;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        title="Online booking"
        subtitle={`Let ${noun}s book their own slot from a link you share — no login needed for them.`}
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="17" rx="2" />
            <path d="M3 9h18M8 2v4M16 2v4" />
          </svg>
        }
      />
      <Link href={backLink} className="text-sm text-muted">
        ← Back
      </Link>

      <label className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3.5 shadow-sm">
        <span className="text-sm font-medium text-foreground">Enable public booking link</span>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5 rounded border-border" />
      </label>

      {publicUrl && enabled && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
          <p className="text-xs font-medium text-brand-dark">Your booking link — share this anywhere</p>
          <p className="break-all rounded-lg bg-surface px-3 py-2 text-xs text-foreground">{publicUrl}</p>
          <div className="flex gap-2">
            <button
              onClick={() => navigator.clipboard.writeText(publicUrl)}
              className="rounded-lg border border-brand px-3 py-1.5 text-xs font-medium text-brand-dark"
            >
              Copy link
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Book an appointment: ${publicUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-brand px-3 py-1.5 text-xs font-medium text-brand-dark"
            >
              💬 Share on WhatsApp
            </a>
          </div>
        </div>
      )}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Slot length (minutes)</span>
        <input
          type="number"
          min={5}
          step={5}
          value={slotDuration}
          onChange={(e) => setSlotDuration(Number(e.target.value) || 20)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Working hours</p>
        {DAYS.map((day) => (
          <div key={day.key} className="rounded-lg border border-border bg-surface p-3">
            <label className="flex items-center justify-between">
              <span className="text-sm text-foreground">{day.label}</span>
              <input type="checkbox" checked={!!hours[day.key]} onChange={() => toggleDay(day.key)} className="h-4 w-4 rounded border-border" />
            </label>
            {dayRanges(day.key).length > 0 && (
              <div className="mt-2 flex flex-col gap-1.5">
                {dayRanges(day.key).map((range, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="time"
                      value={range.start}
                      onChange={(e) => updateRange(day.key, i, { start: e.target.value })}
                      className="flex-1 rounded-lg border border-border px-2 py-1.5 text-xs outline-none focus:border-brand"
                    />
                    <span className="text-xs text-muted">to</span>
                    <input
                      type="time"
                      value={range.end}
                      onChange={(e) => updateRange(day.key, i, { end: e.target.value })}
                      className="flex-1 rounded-lg border border-border px-2 py-1.5 text-xs outline-none focus:border-brand"
                    />
                    {dayRanges(day.key).length > 1 && (
                      <button onClick={() => removeRange(day.key, i)} className="text-xs font-medium text-danger">
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={() => addRange(day.key)} className="self-start text-xs font-medium text-brand">
                  + Add another session (e.g. evening)
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && <p className="text-sm text-brand">Saved.</p>}
      <button onClick={save} disabled={isPending} className="btn-primary w-full text-center disabled:opacity-60">
        {isPending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
