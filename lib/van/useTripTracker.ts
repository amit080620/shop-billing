"use client";

import { useEffect, useRef, useState } from "react";
import { PING_EVERY_MS, worthPinging } from "./geo";

/** The phone's place during a van trip that is on the route (route tracking). Readings are taken only
 * while the screen is open, kept every two minutes after moving 30 m, held on the phone while there is
 * no internet and sent in batches to /api/van/ping — a plain request, so a bill never waits on it. A
 * denied or missing location changes nothing else: billing works the same. */

export type Fix = { lat: number; lng: number; accuracy: number | null };
export type TrackerState = "off" | "asking" | "on" | "denied" | "unavailable";
type Queued = Fix & { at: string; source: string; speed: number | null };

const key = (tripId: string) => `ray-van-pings:${tripId}`;
const startedKey = (tripId: string) => `ray-van-started:${tripId}`;

function readQueue(tripId: string): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(key(tripId)) ?? "[]") as Queued[];
  } catch {
    return [];
  }
}
function writeQueue(tripId: string, q: Queued[]) {
  try {
    localStorage.setItem(key(tripId), JSON.stringify(q.slice(-500)));
  } catch {
    // Storage full or off: this reading is lost, nothing else.
  }
}

let flushing = false;
async function flush(tripId: string) {
  if (flushing || typeof navigator !== "undefined" && !navigator.onLine) return;
  const q = readQueue(tripId);
  if (!q.length) return;
  flushing = true;
  try {
    const batch = q.slice(0, 200);
    const res = await fetch("/api/van/ping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId, pings: batch }), keepalive: true });
    if (res.ok || res.status === 403) writeQueue(tripId, readQueue(tripId).slice(batch.length));
  } catch {
    // No internet: kept for later.
  } finally {
    flushing = false;
  }
}

/** One reading now, with its reason (the van coming back, a check-in). */
export function queuePing(tripId: string, fix: Fix | null, source: string) {
  if (!fix) return;
  writeQueue(tripId, [...readQueue(tripId), { ...fix, at: new Date().toISOString(), source, speed: null }]);
  void flush(tripId);
}

export function useTripTracker(tripId: string | null): { fix: Fix | null; state: TrackerState } {
  const [fix, setFix] = useState<Fix | null>(null);
  const [state, setState] = useState<TrackerState>("off");
  const last = useRef<{ at: number; fix: Fix } | null>(null);

  useEffect(() => {
    if (!tripId) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState("unavailable");
      return;
    }
    let watch: number | null = null;
    const onOnline = () => void flush(tripId);
    const start = () => {
      if (watch !== null || document.visibilityState !== "visible") return;
      setState((s) => (s === "on" ? s : "asking"));
      watch = navigator.geolocation.watchPosition(
        (pos) => {
          const f: Fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null };
          setFix(f);
          setState("on");
          const now = Date.now();
          let source = "auto";
          try {
            if (!localStorage.getItem(startedKey(tripId))) {
              localStorage.setItem(startedKey(tripId), "1");
              source = "start";
            }
          } catch {
            // No storage: every reading is an ordinary one.
          }
          if (source === "start" || !last.current || (now - last.current.at >= PING_EVERY_MS && worthPinging(last.current.fix, f))) {
            last.current = { at: now, fix: f };
            writeQueue(tripId, [...readQueue(tripId), { ...f, at: new Date(now).toISOString(), source, speed: pos.coords.speed ?? null }]);
            void flush(tripId);
          }
        },
        (err) => setState(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 60_000 },
      );
    };
    const stop = () => {
      if (watch !== null) navigator.geolocation.clearWatch(watch);
      watch = null;
    };
    const onVisible = () => (document.visibilityState === "visible" ? start() : stop());
    start();
    void flush(tripId);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [tripId]);

  return { fix, state };
}
