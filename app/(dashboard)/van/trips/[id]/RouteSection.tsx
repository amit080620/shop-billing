"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "@/lib/link";
import { Camera, MapPin, Navigation, Plus } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";
import { addShopOnRouteAction, checkInAction, saveShopPinAction, uploadVanPhotoAction } from "@/lib/actions/van";
import { flushVisits, queueVisit, queuedVisits } from "@/lib/van/offlineVan";
import { photoForm } from "@/lib/van/photoShrink";
import { distanceM, nearestOrder, navigateTo, OUTCOME_LABEL, routeLinks, VISIT_OUTCOMES, type VisitOutcome } from "@/lib/van/geo";
import { queuePing, type Fix, type TrackerState } from "@/lib/van/useTripTracker";
import type { RouteShop, Visit } from "@/lib/van/data";
import { ErrorNote, useRun } from "../../ui";

const STATE_TEXT: Record<TrackerState, string> = {
  off: "Location is off.",
  asking: "Finding your location…",
  on: "Location is on while this trip is on the route.",
  denied: "Location is blocked for this app. Billing works; visits are saved without a place.",
  unavailable: "This phone can't give a location right now. Billing works as usual.",
};

/** Today's route for the salesman: the beat's shops nearest-next from where he is, each with its
 * status, distance, one-tap navigation in Google Maps (a free link) and "Reached shop" with what came of
 * it; the whole remaining route as links; a new shop met on the way. */
export function RouteSection({ tripId, shops, visits, fix, state, onRoute, photos = false }: { tripId: string; shops: RouteShop[]; visits: Visit[]; fix: Fix | null; state: TrackerState; onRoute: boolean; photos?: boolean }) {
  const { t } = useT();
  const { run, pending, error } = useRun();
  const [open, setOpen] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<VisitOutcome>("no_order");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [visitPhoto, setVisitPhoto] = useState<File | null>(null);
  const [note2, setNote2] = useState<string | null>(null);
  const [kept, setKept] = useState(0);
  // Visits saved on the phone with no internet go up now (and when it comes back).
  useEffect(() => {
    setKept(queuedVisits(tripId).length);
    const send = () => void flushVisits(tripId).then(() => setKept(queuedVisits(tripId).length));
    send();
    window.addEventListener("online", send);
    return () => window.removeEventListener("online", send);
  }, [tripId]);

  const lastVisit = useMemo(() => {
    const m = new Map<string, Visit>();
    for (const v of visits) if (v.customerId) m.set(v.customerId, v);
    return m;
  }, [visits]);
  const pending_ = shops.filter((s) => !lastVisit.has(s.id));
  const done = shops.filter((s) => lastVisit.has(s.id));
  const ordered = nearestOrder(fix, pending_);
  const stops = ordered.filter((s) => s.lat !== null && s.lng !== null).map((s) => ({ lat: s.lat!, lng: s.lng! }));
  const links = routeLinks(stops);
  const away = (s: RouteShop) => (fix && s.lat !== null && s.lng !== null ? distanceM(fix, { lat: s.lat, lng: s.lng }) : null);
  const km = (m: number | null) => (m === null ? "" : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

  const chip = (s: RouteShop) => {
    const v = lastVisit.get(s.id);
    if (!v) return <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">{t("Pending")}</span>;
    const billed = v.outcome === "billed";
    return (
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${billed ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
        {t(OUTCOME_LABEL[v.outcome as VisitOutcome] ?? v.outcome)}
        {v.verified === false ? ` · ${t("far")}` : ""}
      </span>
    );
  };

  const row = (s: RouteShop) => (
    <li key={s.id} className="flex flex-col gap-2 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
          <p className="text-xs text-muted">
            {s.lat === null ? t("No location yet") : km(away(s))}
            {s.lat !== null && !s.pinVerified ? ` · ${t("location not approved")}` : ""}
          </p>
        </div>
        {chip(s)}
      </div>
      {onRoute && (
        <div className="flex flex-wrap gap-2">
          {s.lat !== null && s.lng !== null && (
            <a href={navigateTo({ lat: s.lat, lng: s.lng })} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground">
              <Navigation size={13} /> {t("Navigate")}
            </a>
          )}
          <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)} className="rounded-lg border border-brand px-2.5 py-1.5 text-xs font-semibold text-brand-text">
            {t("Reached shop")}
          </button>
          {s.lat === null && fix && (
            <button type="button" disabled={pending} onClick={() => run(() => saveShopPinAction(s.id, { lat: fix.lat, lng: fix.lng }))} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground disabled:opacity-60">
              <MapPin size={13} /> {t("Save this as the shop's location")}
            </button>
          )}
        </div>
      )}
      {open === s.id && (
        <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-2.5">
          <p className="text-xs text-muted">{t("No bill here? Say why. A bill made here records the visit by itself.")}</p>
          <div className="flex flex-wrap gap-1.5">
            {VISIT_OUTCOMES.filter((o) => o !== "billed").map((o) => (
              <button key={o} type="button" onClick={() => setOutcome(o)} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${outcome === o ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
                {t(OUTCOME_LABEL[o])}
              </button>
            ))}
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Note (optional)")} className="rounded-lg px-3 py-2 text-sm" />
          {photos && (
            <label className="flex cursor-pointer items-center gap-2 self-start rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-foreground">
              <Camera size={14} /> {visitPhoto ? t("Photo added") : t("Photo (optional)")}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setVisitPhoto(e.target.files?.[0] ?? null)} />
            </label>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setNote2(null);
                // No internet: the visit is kept on the phone and goes up by itself later (without its photo).
                if (photos && typeof navigator !== "undefined" && !navigator.onLine) {
                  queueVisit(tripId, { customerId: s.id, outcome, note: note.trim().slice(0, 200), fix });
                  setKept(queuedVisits(tripId).length);
                  setNote2(visitPhoto ? t("No internet: the visit is kept on this phone and sent later, without its photo.") : t("No internet: the visit is kept on this phone and sent later."));
                  setOpen(null);
                  setNote("");
                  setVisitPhoto(null);
                  return;
                }
                run(
                  async () => {
                    const saved = await checkInAction(tripId, { customerId: s.id, outcome, note, fix });
                    if (saved.error || !saved.id || !visitPhoto) return saved;
                    const up = await uploadVanPhotoAction("visit", saved.id, await photoForm(visitPhoto));
                    if (up.error) setNote2(t("The visit is saved, but its photo didn't go up: {why}", { why: up.error }));
                    return saved;
                  },
                  () => {
                    setOpen(null);
                    setNote("");
                    setVisitPhoto(null);
                  },
                );
              }}
              className="btn-primary-sm disabled:opacity-60"
            >
              {t("Save visit")}
            </button>
            <Link href={`/bills/new?trip=${tripId}&customer=${s.id}`} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground">
              {t("Make a bill instead")}
            </Link>
          </div>
        </div>
      )}
    </li>
  );

  return (
    <section className="neu-card flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("Today's route")}</h2>
        <Link href={`/van/trips/${tripId}/map`} className="flex items-center gap-1 text-xs font-semibold text-brand-text underline">
          <MapPin size={13} /> {t("Map")}
        </Link>
      </div>
      {onRoute && <p className={`rounded-lg px-3 py-1.5 text-[11px] ${state === "on" ? "bg-success-soft text-foreground" : "bg-warning-soft text-foreground"}`}>{t(STATE_TEXT[state])}</p>}
      {kept > 0 && <p className="text-[11px] text-credit">{t("{n} visit(s) kept on this phone, waiting for the internet.", { n: kept })}</p>}
      {note2 && <p className="text-[11px] text-muted">{note2}</p>}
      {shops.length === 0 && <p className="text-xs text-muted">{t("No shops on this route. Set the trip's route to a beat your parties have, or add shops on the way.")}</p>}
      {onRoute && links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map((href, i) => (
            <a key={href} href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white">
              <Navigation size={13} /> {links.length === 1 ? t("Navigate full route") : t("Route part {n}", { n: i + 1 })}
            </a>
          ))}
        </div>
      )}
      <ul className="flex flex-col divide-y divide-border">{[...ordered, ...done].map(row)}</ul>
      {onRoute && (
        <>
          {!adding ? (
            <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1 self-start text-xs font-semibold text-brand-text">
              <Plus size={13} /> {t("Add a new shop here")}
            </button>
          ) : (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("Shop name")} className="rounded-lg px-3 py-2 text-sm" />
              <input type="tel" inputMode="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder={t("Mobile number")} className="rounded-lg px-3 py-2 text-sm" />
              <p className="text-[11px] text-muted">{fix ? t("Its location is saved where you are standing.") : t("No location right now; it can be saved later.")}</p>
              <button type="button" disabled={pending} onClick={() => run(() => addShopOnRouteAction(tripId, { name: newName, phone: newPhone, fix }), () => { setAdding(false); setNewName(""); setNewPhone(""); })} className="btn-primary-sm self-start disabled:opacity-60">
                {t("Add shop")}
              </button>
            </div>
          )}
        </>
      )}
      <ErrorNote error={error} />
    </section>
  );
}

/** A reading as the van comes back (the trip's end). */
export const pingEnd = (tripId: string, fix: Fix | null) => queuePing(tripId, fix, "end");
