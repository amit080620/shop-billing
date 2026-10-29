const CLIENT_BUILD = process.env.NEXT_PUBLIC_BUILD_ID;
const NOTHING_REVALIDATED = "[[],0,0]";

function isServerAction(init?: RequestInit): boolean {
  const headers = init?.headers;
  if (!headers) return false;
  if (headers instanceof Headers) return headers.has("next-action");
  if (Array.isArray(headers)) return headers.some(([name]) => name.toLowerCase() === "next-action");
  return Object.keys(headers).some((name) => name.toLowerCase() === "next-action");
}

/** A save (server action) answered by a NEWER deploy than the code running on
 * this phone. When the reply carries a screen (the save refreshed the page or
 * moved on, like a new bill opening its invoice), that screen is built from the
 * new deploy's pieces, which this page never loaded, and showing it crashes
 * ("Cannot read properties of undefined (reading 'call')", "Loading chunk …
 * failed"). Next.js checks this on page-to-page navigation but not on server
 * action replies.
 *
 * The save itself has already happened on the server, so this loads where it
 * leads fresh instead: the redirect target, or this page again. Without it, the
 * crash screen reloaded the old page, so a new bill looked like it had failed
 * and could be made twice. The middleware stamps every server action reply with
 * the server's deploy id (x-ray-build). Normal replies pass straight through. */
/** Screens remembered in the router may be out of date after a save. */
export function markScreensStale() {
  if (typeof window !== "undefined") (window as Window & { __rayScreensStale?: boolean }).__rayScreensStale = true;
}

/** True once after a save marked them, then false until the next. */
export function takeScreensStale(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & { __rayScreensStale?: boolean };
  const stale = !!w.__rayScreensStale;
  w.__rayScreensStale = false;
  return stale;
}

export function installActionGuard() {
  if (typeof window === "undefined" || !CLIENT_BUILD) return;
  const w = window as Window & { __rayActionGuard?: boolean };
  if (w.__rayActionGuard) return;
  w.__rayActionGuard = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await originalFetch(input, init);
    if (!isServerAction(init)) return res;
    // A save that didn't clear the remembered screens may have changed what they show: the next
    // screen opened is refreshed right after it appears (FreshAfterSave).
    if (!res.headers.get("x-action-redirect") && (res.headers.get("x-action-revalidated") ?? NOTHING_REVALIDATED) === NOTHING_REVALIDATED) markScreensStale();
    const serverBuild = res.headers.get("x-ray-build");
    if (!serverBuild || serverBuild === CLIENT_BUILD) return res;
    const redirect = res.headers.get("x-action-redirect")?.split(";")[0];
    const revalidated = res.headers.get("x-action-revalidated");
    if (!redirect && (!revalidated || revalidated === NOTHING_REVALIDATED)) return res;

    if (redirect) window.location.assign(new URL(redirect, window.location.href).href);
    else window.location.reload();
    // Never hand the router a screen it can't show; the page is being replaced.
    return new Promise<Response>(() => {});
  };
}
