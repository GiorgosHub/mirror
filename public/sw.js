/* MIRROR service worker: the app shell works offline. Video is never pre-cached (it's large and optional),
   and API calls always go to the network. */
const VERSION = "mirror-__BUILD__";
const SHELL = ["/", "/index.html", "/app.js", "/app.css", "/manifest.webmanifest", "/fonts/Inter-var.woff2", "/fonts/BricolageGrotesque-Bold.woff", "/fonts/BricolageGrotesque-Regular.woff", "/icons/mark.svg", "/media/possibility-field.jpg", "/media/possibility-field.webp"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.endsWith(".mp4") || url.pathname.endsWith(".webm")) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request).then((m) => m || caches.match("/index.html")))
  );
});
