/*
 * Infill service worker.
 *
 * - Page navigations go to the network; if that fails (offline), the cached
 *   /offline.html is shown instead of the browser's error page.
 * - Same-origin /_next/static/* files are content-hashed and immutable, so
 *   they are served cache-first.
 * - Everything else (API routes, images, RSC requests, other origins such as
 *   wa.me) passes straight through and is never cached.
 *
 * Bump VERSION to drop old caches on the next visit.
 */
const VERSION = "v1";
const PREFIX = "infill-";
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;
const STATIC_CACHE = `${PREFIX}static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icon.svg"];
const MAX_STATIC_ENTRIES = 300;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, STATIC_CACHE]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith(PREFIX) && !keep.has(key)).map((key) => caches.delete(key)));
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          // Not supported here; navigations just fetch normally.
        }
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(navigate(event));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") && !request.headers.has("range")) {
    event.respondWith(cacheFirst(event));
  }
});

/** Network first; the offline page when the network is unreachable. */
async function navigate(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    return (
      offline ||
      new Response("You are offline.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

/** Cache first for immutable build assets; fills the cache on a miss. */
async function cacheFirst(event) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(event.request);
  if (hit) return hit;

  const response = await fetch(event.request);
  if (response.ok && response.type === "basic") {
    event.waitUntil(
      cache
        .put(event.request, response.clone())
        .then(() => trim(cache))
        .catch(() => {}),
    );
  }
  return response;
}

/** Keeps the asset cache bounded across deploys (oldest entries go first). */
async function trim(cache) {
  const keys = await cache.keys();
  const excess = keys.length - MAX_STATIC_ENTRIES;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}
