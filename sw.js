/* Cache the shell so the app opens with no signal — gym basements are gym
   basements. Bump CACHE when you change any of these files. */
const CACHE = 'ironlog-v6';
const SHELL = [
  './', './index.html', './styles.css', './program.js', './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  // cache:'reload' skips the browser's HTTP cache (Pages sends max-age=600), so a
  // new worker never installs ten-minute-old copies of the files it replaces
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      // caches are shared by every app on nschroder99.github.io, so only clear Ironlog's own
      .then(keys => Promise.all(keys.filter(k => k.startsWith('ironlog-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Network-first so a deploy shows up next time you open it, cache as fallback. */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;   // let fonts hit the network
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        // don't let a 404/5xx replace a good offline copy
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
