"use client";

import { keepValuesOnError } from "@/lib/keepValuesOnError";
import { useState, useTransition } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
;
import { createClassAction, toggleClassActiveAction, deleteClassAction, bookClassAction, cancelClassBookingAction } from "@/lib/actions/gym";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import type { Lang } from "@/lib/i18n/dictionary";
import { CalendarDays, X } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";
import { BackLink } from "@/app/components/BackLink";

type ClassBooking = { id: string; memberId: string; memberName: string };
type GymClass = {
  id: string;
  name: string;
  trainerName: string | null;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  capacity: number;
  isActive: boolean;
  todayBookings: ClassBooking[];
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function SubmitButton({ t }: { t: (key: string) => string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary-sm disabled:opacity-60">
      {pending ? t("products.saving") : t("+ Add class")}
    </button>
  );
}

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function ClassesClient({
  lang,
  isOwner,
  todayIso,
  todayDow,
  trainers,
  members,
  classes,
}: {
  lang: Lang;
  isOwner: boolean;
  todayIso: string;
  todayDow: number;
  trainers: { id: string; name: string }[];
  members: { id: string; name: string; phone: string }[];
  classes: GymClass[];
}) {
  const { t } = useT();
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [bookingFor, setBookingFor] = useState<GymClass | null>(null);
  const [, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [state, formAction] = useActionState(
    keepValuesOnError(async (prev: { error?: string } | null, formData: FormData) => {
      const result = await createClassAction(prev, formData);
      if (!result?.error) {
        setShowForm(false);
        router.refresh();
      }
      return result;
    }),
    null,
  );

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/gym/members" />
      <PageHeader
        title={t("Classes")}
        subtitle={t("Weekly schedule — a lightweight roster, not a live capacity/waitlist system.")}
        action={
          isOwner ? (
            <button onClick={() => setShowForm((v) => !v)} className="btn-primary-sm">
              + {t("Class")}
            </button>
          ) : undefined
        }
        icon={<CalendarDays size={18} strokeWidth={1.8} />}
      />

      {showForm && (
        <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <input name="name" placeholder={t("Class name (e.g. Yoga, Zumba)")} required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          <select name="trainerId" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand">
            <option value="">{t("No trainer assigned")}</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input type="hidden" name="dayOfWeek" value={dayOfWeek} />
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => setDayOfWeek(i)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${dayOfWeek === i ? "border-brand bg-surface text-brand-text" : "border-transparent bg-surface/60 text-muted"}`}
              >
                {DAY_SHORT[i]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input name="startTime" type="time" required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
            <input name="durationMinutes" type="number" min="15" step="15" defaultValue={60} placeholder={t("Minutes")} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
            <input name="capacity" type="number" min="1" defaultValue={15} placeholder={t("Capacity")} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          {state?.error && <p className="text-sm text-danger">{state.error}</p>}
          <div className="flex gap-2">
            <SubmitButton t={t} />
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      {classes.length === 0 ? (
        <EmptyState text={t("No classes set up yet.")} />
      ) : (
        DAYS.map((dayName, dow) => {
          const dayClasses = classes.filter((c) => c.dayOfWeek === dow && c.isActive);
          if (dayClasses.length === 0) return null;
          return (
            <div key={dow} className="flex flex-col gap-2">
              <p className={`text-xs font-semibold ${dow === todayDow ? "text-brand-text" : "text-muted"}`}>
                {t(dayName)} {dow === todayDow ? `· ${t("Today")}` : ""}
              </p>
              <ul className="flex flex-col gap-2">
                {dayClasses.map((c) => (
                  <li key={c.id} className={`neu-card p-3.5 ${deletingId === c.id ? "animate-delete" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{c.name}</p>
                        <p className="text-xs text-muted">
                          {formatTime(c.startTime)} · {c.durationMinutes} min{c.trainerName ? ` · ${c.trainerName}` : ""}
                        </p>
                      </div>
                      {isOwner && (
                        <div className="flex shrink-0 gap-2 text-xs">
                          <button
                            onClick={() =>
                              startTransition(async () => {
                                await toggleClassActiveAction(c.id, !c.isActive);
                                router.refresh();
                              })
                            }
                            className="text-muted"
                          >
                            {t("Deactivate")}
                          </button>
                          <button
                            onClick={() => {
                              if (!confirm(t('Delete "{name}"?', { name: c.name }))) return;
                              setDeletingId(c.id);
                              startTransition(async () => {
                                await deleteClassAction(c.id);
                                router.refresh();
                              });
                            }}
                            className="text-danger"
                          >
                            {t("common.delete")}
                          </button>
                        </div>
                      )}
                    </div>
                    {dow === todayDow && (
                      <div className="mt-2 flex flex-col gap-1.5">
                        <p className="text-[11px] text-muted">
                          {t("{n}/{cap} booked today", { n: c.todayBookings.length, cap: c.capacity })}
                        </p>
                        {c.todayBookings.length > 0 && (
                          <ul className="flex flex-wrap gap-1">
                            {c.todayBookings.map((b) => (
                              <li key={b.id} className="flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] text-brand-text">
                                {b.memberName}
                                <button
                                  onClick={() =>
                                    startTransition(async () => {
                                      await cancelClassBookingAction(b.id);
                                      router.refresh();
                                    })
                                  }
                                  className="font-bold"
                                >
                                  <X size={12} />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <button onClick={() => setBookingFor(c)} className="self-start text-xs font-medium text-brand">
                          + {t("Book a member")}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}

      {bookingFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setBookingFor(null)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-surface p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground">{t("Book into {name}", { name: bookingFor.name })}</p>
            <div className="mt-3">
              <SearchableSelect
                lang={lang}
                items={members}
                getKey={(m) => m.id}
                getLabel={(m) => m.name}
                getSubLabel={(m) => m.phone}
                onSelect={(m) =>
                  startTransition(async () => {
                    const result = await bookClassAction(bookingFor.id, m.id, todayIso);
                    if (!result.error) setBookingFor(null);
                    router.refresh();
                  })
                }
                placeholder={t("Search member…")}
              />
            </div>
            <button onClick={() => setBookingFor(null)} className="mt-3 w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
              {t("common.close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
