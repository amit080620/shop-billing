// The Ray — offline billing only.
//
// Registered for /offline-bill alone (its scope), so no other screen of the app ever passes through
// it: switching tabs, saving a bill and every other request go straight to the network as if it
// weren't there. It keeps Offline billing and its files on the phone, so that page opens with no
// internet (the Android app's "No internet" screen, and New Bill's offline note, lead there).
//
// While the network answers it serves nothing itself (serving older files first was what made the
// earlier, removed worker crash pages). The copy is refreshed at most once a day, when the app asks
// (message "refresh") — not on every release, so a phone isn't downloading it again and again
// while the shop is billing.

const CACHE = "ray-offline-v2";
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

/** A fresh copy of the page and its files, built aside and swapped in only when complete. */
async function keepCopy() {
  const fresh = await caches.open(CACHE + "-next");
  const page = await fetch(PAGE, { credentials: "include", cache: "no-store" });
  if (!page.ok) throw new Error("offline page " + page.status);
  const html = await page.clone().text();
  await fresh.put(PAGE, page);
  const assets = assetsIn(html);
  for (const css of assets.filter((a) => a.endsWith(".css"))) {
    try {
      const res = await fetch(css);
      if (res.ok) {
        const text = await res.clone().text();
        await fresh.put(css, res);
        for (const a of assetsIn(text)) assets.push(a);
      }
    } catch {
      // Kept without it; the page still works unstyled.
    }
  }
  await Promise.all([...new Set(assets)].map((a) => fresh.add(a).catch(() => {})));
  // Swap: the complete new copy replaces the old one.
  await caches.delete(CACHE);
  const done = await caches.open(CACHE);
  for (const req of await fresh.keys()) {
    const res = await fresh.match(req);
    if (res) await done.put(req, res);
  }
  await caches.delete(CACHE + "-next");
}

self.addEventListener("install", (event) => {
  event.waitUntil(keepCopy());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("ray-offline-") && key !== CACHE && key !== CACHE + "-next") await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "refresh") event.waitUntil(keepCopy().catch(() => {}));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(async () => (await caches.match(PAGE, { ignoreSearch: true })) || Response.error()));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(fetch(req).catch(async () => (await caches.match(req, { ignoreSearch: true })) || Response.error()));
  }
});
