/* DONKO SYNTIX : met en cache UNIQUEMENT la coquille statique.
   Les réponses de l'API (données de trading) ne sont jamais mises en cache. */
const CACHE = "donko-syntix-shell-v3";
const SHELL = [
  "./index.html", "./manifest.json",
  "./site.css", "./i18n.js", "./app.js",
  "./donko.png", "./icon-192.png", "./icon-512.png",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.pathname.includes("/api/")) return;          // jamais de données de trading en cache
  if (url.origin !== self.location.origin) return;     // liens Weltrade : réseau direct
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
