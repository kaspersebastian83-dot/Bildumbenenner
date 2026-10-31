/* Bildumbenenner – Service Worker
   Makes the online version usable offline and installable.
   Strategy "network first": when online, the network response is preferred; this does not update running page code; when offline or the network is slow (> 4 s), the last cached version is used.
   Only the app's own files are handled here – project folders, photos and PDFs never pass through this file.

   Other apps live under the same address (e.g. …github.io/Probenplan/) and share the browser's cache storage.
   This worker therefore only ever touches caches with its own prefix and only answers requests inside its own scope. */
const SCOPE = self.registration.scope;
const PREFIX = 'bildumbenenner:' + SCOPE + ':';
const CACHE = PREFIX + 'v12';
const ASSETS = ['./', './index.html', './spektron-ordner.js', './project-store.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png']
  .map(f => new URL(f, SCOPE).href);
const INDEX = new URL('index.html', SCOPE).href;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // Do not delete browser data during the cutover. Old caches may still be needed
  // by old sessions; only an external write fence can stop those sessions writing.
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(SCOPE)) return;
  if (new URL(req.url).searchParams.has('fotokit-update')){
    // Never present an offline fallback as evidence of the online release.
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(() => new Response('', { status: 503 })));
    return;
  }
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const fromNet = fetch(req, { cache: 'no-store' }).then(res => {
      if (res.ok && res.type === 'basic') cache.put(req.mode === 'navigate' ? INDEX : req, res.clone());
      return res;
    });
    const timeout = new Promise(res => setTimeout(() => res(null), 4000));
    try{
      const res = await Promise.race([fromNet, timeout]);
      if (res) return res;
    }catch(err){ /* offline – fall through to cache */ }
    const cached = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' && await cache.match(INDEX));
    return cached || fromNet;   // nothing cached yet: keep waiting for the network
  })());
});
