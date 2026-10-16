// Service worker: NETWORK-FIRST, so updated files show up as soon as you're online.
// The cache is only a fallback for when the network fails (offline).
// All paths are relative (./) so this works from any folder, e.g. /newApp/.

const CACHE = "whos-that-pokemon-v1";

// App shell, saved on install so the app can open offline.
const SHELL = [
  "./",
  "./index.html",
  "./style-v2.css",
  "./app-v2.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Add files one at a time so one missing file can't break the install.
      Promise.all(
        SHELL.map((url) =>
          fetch(url, { cache: "no-cache" })
            .then((res) => (res.ok ? cache.put(url, res) : null))
            .catch(() => null)
        )
      )
    )
  );
  self.skipWaiting(); // activate the new worker right away
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  event.respondWith(networkFirst(req, url));
});

async function networkFirst(req, url) {
  const cache = await caches.open(CACHE);
  try {
    // For our own files, skip the browser's HTTP cache too so updates appear immediately.
    const sameOrigin = url.origin === self.location.origin;
    const res = await fetch(req, sameOrigin ? { cache: "no-cache" } : undefined);

    // Save a copy (normal or opaque cross-origin image responses) for offline use.
    if (res && (res.ok || res.type === "opaque")) {
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    // Network failed: fall back to whatever we saved earlier.
    const cached = await cache.match(req);
    if (cached) return cached;

    // Offline page load: serve the app itself.
    if (req.mode === "navigate") {
      const page = (await cache.match("./index.html")) || (await cache.match("./"));
      if (page) return page;
    }
    throw err;
  }
}
