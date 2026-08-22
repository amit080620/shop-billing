"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveBookingSettingsAction, type WorkingHours } from "@/lib/actions/clinic";
import { Camera, MessageCircle, X } from "lucide-react";
import { uploadSettingsImageAction } from "@/lib/actions/settings";
import { PageHeader } from "@/app/components/PageHeader";
import { CalendarClock } from "lucide-react";
import { todayIso } from "@/lib/dateHelpers";

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
  doctorName: initialDoctorName,
  doctorQualifications: initialDoctorQualifications,
  doctorPhotoUrl,
  unavailableDates: initialUnavailableDates,
}: {
  slotDurationMinutes: number;
  workingHours: WorkingHours;
  isPublicBookingEnabled: boolean;
  publicToken: string | null;
  businessType: string;
  doctorName: string;
  doctorQualifications: string;
  doctorPhotoUrl: string | null;
  unavailableDates: string[];
}) {
  const router = useRouter();
  const [slotDuration, setSlotDuration] = useState(String(initialSlotDuration));
  const [enabled, setEnabled] = useState(initialEnabled);
  const [hours, setHours] = useState<WorkingHours>(initialHours);
  const [doctorName, setDoctorName] = useState(initialDoctorName);
  const [doctorQualifications, setDoctorQualifications] = useState(initialDoctorQualifications);
  const [unavailableDates, setUnavailableDates] = useState<string[]>(initialUnavailableDates);
  const [newLeaveDate, setNewLeaveDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const isClinic = businessType === "clinic";

  async function handlePhotoUpload(file: File) {
    setUploadingPhoto(true);
    setPhotoError(null);
    const formData = new FormData();
    formData.append("image", file);
    const result = await uploadSettingsImageAction("doctor_photo", formData);
    if (result.error) setPhotoError(result.error);
    setUploadingPhoto(false);
    router.refresh();
  }

  function addLeaveDate() {
    if (!newLeaveDate || unavailableDates.includes(newLeaveDate)) return;
    setUnavailableDates((prev) => [...prev, newLeaveDate].sort());
    setNewLeaveDate("");
  }
  function removeLeaveDate(date: string) {
    setUnavailableDates((prev) => prev.filter((d) => d !== date));
  }

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
      const result = await saveBookingSettingsAction({
        slotDurationMinutes: Math.max(5, Number(slotDuration) || 20),
        workingHours: hours,
        isPublicBookingEnabled: enabled,
        doctorName,
        doctorQualifications,
        unavailableDates,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    });
  }

  const publicUrl = publicToken && typeof window !== "undefined" ? `${window.location.origin}/book/${publicToken}` : null;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        title="Online booking"
        subtitle={`Let ${noun}s book their own slot from a link you share — no login needed for them.`}
        icon={<CalendarClock size={18} strokeWidth={1.8} />}
      />
      <Link href={backLink} className="text-sm text-muted">
        ← Back
      </Link>

      <label className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3.5 shadow-sm">
        <span className="text-sm font-medium text-foreground">Enable public booking link</span>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5 rounded border-border" />
      </label>

      {isClinic && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-sm font-medium text-foreground">Doctor profile — shown on your booking link</p>
          <div className="flex items-center gap-3">
            <label className="relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-border bg-background text-[10px] text-muted">
              {doctorPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- small settings preview
                <img src={doctorPhotoUrl} alt="" className="h-full w-full object-cover" />
              ) : uploadingPhoto ? (
                "…"
              ) : (
                <Camera size={16} />
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoUpload(file);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="flex flex-1 flex-col gap-2">
              <input
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder="Dr. Ramesh Kumar"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <input
                value={doctorQualifications}
                onChange={(e) => setDoctorQualifications(e.target.value)}
                placeholder="MBBS, MD (Medicine)"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
          </div>
          {photoError && <p className="text-xs text-danger">{photoError}</p>}
          <p className="text-xs text-muted">Best size: a square photo, about 400×400px (like a passport photo) — PNG/JPG/WEBP, under 2MB.</p>
        </div>
      )}

      {publicUrl && enabled && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
          <p className="text-xs font-medium text-brand-text">Your booking link — share this anywhere</p>
          <p className="break-all rounded-lg bg-surface px-3 py-2 text-xs text-foreground">{publicUrl}</p>
          <div className="flex gap-2">
            <button
              onClick={() => navigator.clipboard.writeText(publicUrl)}
              className="rounded-lg border border-brand px-3 py-1.5 text-xs font-medium text-brand-text"
            >
              Copy link
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Book an appointment: ${publicUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg border border-brand px-3 py-1.5 text-xs font-medium text-brand-text"
            >
              <MessageCircle size={12} /> Share on WhatsApp
            </a>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Gap between appointments (minutes)</span>
        <p className="text-xs text-muted">After one appointment, the next slot opens this many minutes later.</p>
        <div className="flex flex-wrap gap-2">
          {["10", "15", "20", "30"].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setSlotDuration(preset)}
              className={`rounded-lg border px-3.5 py-2 text-sm font-medium ${
                slotDuration === preset ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
              }`}
              style={
                slotDuration === preset
                  ? { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }
                  : undefined
              }
            >
              {preset} min
            </button>
          ))}
          <input
            type="number"
            min={5}
            step={5}
            value={["10", "15", "20", "30"].includes(slotDuration) ? "" : slotDuration}
            onChange={(e) => setSlotDuration(e.target.value)}
            placeholder="Custom"
            className="w-24 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>
      </div>

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
                        <X size={13} />
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

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Leave / holiday dates</p>
        <p className="text-xs text-muted">
          Blocks a specific date entirely from booking, even if it falls on a normally-working day above — use this for personal leave, festivals, or any day you won&apos;t be available.
        </p>
        <div className="flex gap-2">
          <input
            type="date"
            value={newLeaveDate}
            min={todayIso()}
            onChange={(e) => setNewLeaveDate(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button onClick={addLeaveDate} disabled={!newLeaveDate} className="rounded-lg border border-brand px-3 py-2 text-xs font-medium text-brand-text disabled:opacity-50">
            + Add
          </button>
        </div>
        {unavailableDates.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {unavailableDates.map((date) => (
              <li key={date} className="flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger/10 px-2.5 py-1 text-xs text-danger">
                {new Date(date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}
                <button onClick={() => removeLeaveDate(date)} className="font-bold">
                  <X size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        onClick={save}
        disabled={isPending}
        className={`btn-primary w-full text-center disabled:opacity-60 ${saved ? "animate-save-success" : ""}`}
      >
        {isPending ? "Saving…" : saved ? "Saved ✓" : "Save"}
      </button>
    </div>
  );
}
