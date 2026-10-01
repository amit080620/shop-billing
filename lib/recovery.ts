const KEY = "ray-auto-reload-at";
const WINDOW_MS = 30_000;

/** Hard-reloads the page to recover from a crash — most are a phone still
 * running JavaScript from before the latest deploy. Allowed at most once
 * per 30 seconds, so a genuinely repeating error falls through to the
 * error screen instead of looping. (A once-per-session guard left every
 * crash after the first deploy of the day stuck on the error screen.)
 * Returns true when a reload was started. */
export function reloadOnce(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < WINDOW_MS) return false;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Storage unavailable: still reload once; the browser keeps no guard,
    // but a reload loop needs the error to recur instantly on every load.
  }
  window.location.reload();
  return true;
}

/** Which code the phone was running and on what, added to crash reports so
 * the error log can tell "old version open during an update" apart from a
 * real bug, and an app install from a browser. */
export function crashContext(): { build: string | null; device: string | null } {
  if (typeof navigator === "undefined") return { build: null, device: null };
  const ua = navigator.userAgent;
  const app = ua.match(/TheRayApp\/[\d.]+/)?.[0]?.replace("TheRayApp/", "Android app ");
  const device = app ?? (/Android/.test(ua) ? "Android browser" : /iPhone|iPad/.test(ua) ? "iPhone browser" : "Computer browser");
  return { build: process.env.NEXT_PUBLIC_BUILD_ID ?? null, device };
}
