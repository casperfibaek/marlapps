const CACHE_NAME = 'marlapps-v156';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',

  './icons/icon.svg',
  './icons/icon-72x72.png',
  './icons/icon-96x96.png',
  './icons/icon-128x128.png',
  './icons/icon-144x144.png',
  './icons/icon-152x152.png',
  './icons/icon-192x192.png',
  './icons/icon-384x384.png',
  './icons/icon-512x512.png',

  './themes/tokens.css',
  './themes/dark.css',
  './themes/light.css',
  './themes/futuristic.css',
  './themes/amalfi.css',
  './themes/app-common.css',
  './themes/theme-bootstrap.js',

  './launcher/launcher.css',
  './launcher/theme-manager.js',
  './launcher/app-loader.js',
  './launcher/search.js',
  './launcher/settings.js',
  './launcher/launcher.js',
  './launcher/pwa-install.js',

  './registry/apps.json',

  // AUTO:APP-CACHE-START
  './apps/pomodoro-timer/app.js',
  './apps/pomodoro-timer/icon.svg',
  './apps/pomodoro-timer/index.html',
  './apps/pomodoro-timer/manifest.json',
  './apps/pomodoro-timer/styles.css',

  './apps/kanban-board/app.js',
  './apps/kanban-board/icon.svg',
  './apps/kanban-board/index.html',
  './apps/kanban-board/manifest.json',
  './apps/kanban-board/styles.css',

  './apps/todo-list/app.js',
  './apps/todo-list/icon.svg',
  './apps/todo-list/index.html',
  './apps/todo-list/manifest.json',
  './apps/todo-list/styles.css',

  './apps/notes/app.js',
  './apps/notes/autosave.js',
  './apps/notes/db.js',
  './apps/notes/editor.js',
  './apps/notes/export-markdown.js',
  './apps/notes/icon.svg',
  './apps/notes/index.html',
  './apps/notes/manifest.json',
  './apps/notes/search.js',
  './apps/notes/storage.js',
  './apps/notes/styles.css',

  './apps/tracker/app.js',
  './apps/tracker/chart.js',
  './apps/tracker/icon.svg',
  './apps/tracker/index.html',
  './apps/tracker/manifest.json',
  './apps/tracker/styles.css',

  './apps/mirror/app.js',
  './apps/mirror/icon.svg',
  './apps/mirror/index.html',
  './apps/mirror/manifest.json',
  './apps/mirror/storage.js',
  './apps/mirror/styles.css',

  './apps/timer-countdown/app.js',
  './apps/timer-countdown/icon.svg',
  './apps/timer-countdown/index.html',
  './apps/timer-countdown/manifest.json',
  './apps/timer-countdown/styles.css',

  './apps/timer-alarm/app.js',
  './apps/timer-alarm/icon.svg',
  './apps/timer-alarm/index.html',
  './apps/timer-alarm/manifest.json',
  './apps/timer-alarm/styles.css',

  './apps/timer-interval/app.js',
  './apps/timer-interval/icon.svg',
  './apps/timer-interval/index.html',
  './apps/timer-interval/manifest.json',
  './apps/timer-interval/styles.css',

  './apps/soundscape/app.js',
  './apps/soundscape/icon.svg',
  './apps/soundscape/index.html',
  './apps/soundscape/manifest.json',
  './apps/soundscape/styles.css',

  './apps/breathing/app.js',
  './apps/breathing/icon.svg',
  './apps/breathing/index.html',
  './apps/breathing/manifest.json',
  './apps/breathing/styles.css'
  // AUTO:APP-CACHE-END
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .catch((err) => console.warn('Service worker cache failed:', err))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Always fetch version.json from network — never serve from cache
  if (event.request.url.endsWith('/version.json')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response('{"error":"offline"}', {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) return response;

        return fetch(event.request.clone()).then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Only cache resources under our own origin path
          const url = new URL(event.request.url);
          if (url.origin === self.location.origin) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }

          return response;
        }).catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html').then((fallback) => fallback || Response.error());
          }
          return Response.error();
        });
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    const match = CACHE_NAME.match(/marlapps-v(\d+)/);
    const version = match ? parseInt(match[1], 10) : 0;
    event.ports[0].postMessage({ version });
  }
});
