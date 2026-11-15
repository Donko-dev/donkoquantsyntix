/* DONKO SYNTIX : service worker.
   Stratégie « réseau d'abord » : chaque chargement prend la version publiée sur le serveur.
   Le cache ne sert qu'en secours, quand le réseau est coupé.
   Le nom du cache change à chaque version : les anciens fichiers sont supprimés.
   Les réponses de l'API (données de trading) ne sont jamais mises en cache. */
const CACHE = "donko-syntix-shell-v4";
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
  if (url.origin !== self.location.origin) return;     // liens Weltrade et EMPIRE : réseau direct
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
