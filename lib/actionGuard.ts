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
export function installActionGuard() {
  if (typeof window === "undefined" || !CLIENT_BUILD) return;
  const w = window as Window & { __rayActionGuard?: boolean };
  if (w.__rayActionGuard) return;
  w.__rayActionGuard = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await originalFetch(input, init);
    if (!isServerAction(init)) return res;
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
