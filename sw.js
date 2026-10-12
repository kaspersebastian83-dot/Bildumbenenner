/* Bildumbenenner – Service Worker
   Makes the online version usable offline and installable.
   Strategy "network first": when online, always the newest version from GitHub Pages is loaded (so updates arrive
   immediately); when offline or the network is slow (> 4 s), the last cached version is used.
   Only the app's own files are handled here – project folders, photos and PDFs never pass through this file. */
const CACHE = 'bildumbenenner';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const fromNet = fetch(req, { cache: 'no-store' }).then(res => {
      if (res.ok && res.type === 'basic') cache.put(req.mode === 'navigate' ? './index.html' : req, res.clone());
      return res;
    });
    const timeout = new Promise(res => setTimeout(() => res(null), 4000));
    try{
      const res = await Promise.race([fromNet, timeout]);
      if (res) return res;
    }catch(err){ /* offline – fall through to cache */ }
    const cached = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' && await cache.match('./index.html'));
    return cached || fromNet;   // nothing cached yet: keep waiting for the network
  })());
});
