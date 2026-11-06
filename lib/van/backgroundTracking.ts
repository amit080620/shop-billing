// Route tracking, phase two: the Android app records the trip's route with the screen off — a
// foreground service with a "Trip in progress" notification, sending readings straight to
// /api/van/ping with the trip's key (migration 0067). Only while the trip is on the route; the app
// stops by itself when the server says the trip is off it. Browsers and older app versions don't
// have it: the screen-open tracking (useTripTracker) works there as before.
import { nativeApp } from "../nativeApp";
import { trackingKeyAction } from "../actions/van";

export type BackgroundState = { running: boolean; tripId: string | null };

export const canTrackInBackground = () => !!nativeApp()?.features?.location;

export async function backgroundState(): Promise<BackgroundState> {
  const app = nativeApp();
  if (!app?.features?.location) return { running: false, tripId: null };
  try {
    const s = await app.call<{ running?: boolean; tripId?: string | null }>("location.status");
    return { running: !!s?.running, tripId: s?.tripId ?? null };
  } catch {
    return { running: false, tripId: null };
  }
}

export async function startBackgroundTracking(tripId: string): Promise<{ error?: string }> {
  const app = nativeApp();
  if (!app?.features?.location) return { error: "Update the app to record the route with the screen off." };
  const r = await trackingKeyAction(tripId);
  if (r.error || !r.key) return { error: r.error ?? "Couldn't start tracking." };
  try {
    await app.call("location.start", { tripId, key: r.key, url: `${window.location.origin}/api/van/ping`, everyMs: 120_000, minMoveM: 30 });
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't start tracking." };
  }
}

export async function stopBackgroundTracking(): Promise<void> {
  const app = nativeApp();
  if (!app?.features?.location) return;
  try {
    await app.call("location.stop");
  } catch {
    // Already stopped.
  }
}
