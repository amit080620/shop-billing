// The Ray — offline billing only.
//
// With the internet on, this worker changes nothing: every request goes to the network exactly as
// without it (no file is ever served from here while the network answers — serving older files
// was what made the earlier, removed worker crash pages). Only when the network can't be reached
// does it step in:
//   - any page opened then leads to Offline billing (/offline-bill), kept here with its files;
//   - the app's own files for that page come from the copy kept here.
// The copy belongs to one version of the app (?v=<build>): a new version installs a new worker,
// which keeps a fresh copy and deletes the old one.

const VERSION = new URL(self.location.href).searchParams.get("v") || "0";
const CACHE = "ray-offline-" + VERSION;
const PAGE = "/offline-bill";

/** Every /_next/static file the page names — scripts, styles, fonts (also those named inside its
 * stylesheets), and the chunks listed in its inline router data ("static/chunks/…"). */
function assetsIn(text) {
  const found = new Set();
  for (const m of text.matchAll(/(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\\)\s]+/g)) {
    const path = m[0].startsWith("/_next/") ? m[0] : "/_next/" + m[0];
    found.add(path.replace(/[,;]+$/, ""));
  }
  return [...found];
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const page = await fetch(PAGE, { credentials: "include", cache: "no-store" });
      if (!page.ok) throw new Error("offline page " + page.status);
      const html = await page.clone().text();
      await cache.put(PAGE, page);
      const assets = assetsIn(html);
      // Stylesheets name the fonts.
      for (const css of assets.filter((a) => a.endsWith(".css"))) {
        try {
          const res = await fetch(css);
          if (res.ok) {
            const text = await res.clone().text();
            await cache.put(css, res);
            for (const a of assetsIn(text)) assets.push(a);
          }
        } catch {
          // Kept without it; the page still works unstyled.
        }
      }
      await Promise.all([...new Set(assets)].map((a) => cache.add(a).catch(() => {})));
    })(),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("ray-offline-") && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => {
        // No internet: offline billing, at its own address so the app shows the right screen.
        if (url.pathname !== PAGE) return Response.redirect(PAGE, 302);
        return (await caches.match(PAGE, { ignoreSearch: true })) || Response.error();
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(fetch(req).catch(async () => (await caches.match(req, { ignoreSearch: true })) || Response.error()));
  }
});
