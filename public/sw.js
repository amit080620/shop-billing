const SHELL_CACHE = "shop-billing-shell-v1788231760175";
const ASSET_CACHE = "shop-billing-assets-v1788231760175";
const OFFLINE_URL = "/offline.html";
const OFFLINE_BILL_URL = "/offline-bill";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll([OFFLINE_URL, OFFLINE_BILL_URL])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Next.js's build output under /_next/static/ is content-hashed and
  // immutable — safe to cache-first forever. This is what lets the
  // /offline-bill page's JS actually load with zero connectivity, as long
  // as it was visited at least once while online.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (event.request.mode !== "navigate") return;

  // The offline billing page itself: try the network for the freshest
  // version, but fall back to whatever was cached the last time it loaded
  // successfully — this is the one page in the app designed to actually
  // work with no connection at all.
  if (url.pathname === OFFLINE_BILL_URL) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.open(SHELL_CACHE).then((cache) => cache.match(OFFLINE_BILL_URL))),
    );
    return;
  }

  // Every other page in the app needs a live connection to render at all
  // (session checks, live pricing/stock, GST calculations) — serving a
  // stale cached copy would risk showing wrong data, which is worse than
  // a clear "you're offline" message.
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.open(SHELL_CACHE).then((cache) => cache.match(OFFLINE_URL)),
    ),
  );
});
