/* Crisper service worker.
   To ship an update: change VERSION here AND APP_VERSION in index.html, then redeploy.
   Open copies of the app show an "Update" prompt; nothing reloads under you. */
const VERSION = '1.0.0';
const CACHE = `crisper-${VERSION}`;
const CORE = [
  './', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('crisper-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if(e.data === 'SKIP_WAITING') self.skipWaiting();
  if(e.data === 'GET_VERSION' && e.source) e.source.postMessage({type: 'VERSION', version: VERSION});
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // pages: try the network first so a fresh deploy shows up, fall back to the saved copy when offline
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  // everything else: saved copy first, then the network
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if(res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
