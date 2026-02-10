const CACHE_NAME = 'marlapps-v39';
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

  './launcher/launcher.css',
  './launcher/theme-manager.js',
  './launcher/app-loader.js',
  './launcher/search.js',
  './launcher/settings.js',
  './launcher/launcher.js',
  './launcher/pwa-install.js',

  './registry/apps.json',

  // AUTO:APP-CACHE-START
  './apps/pomodoro-timer/manifest.json',
  './apps/pomodoro-timer/index.html',
  './apps/pomodoro-timer/styles.css',
  './apps/pomodoro-timer/app.js',
  './apps/pomodoro-timer/icon.svg',

  './apps/kanban-board/manifest.json',
  './apps/kanban-board/index.html',
  './apps/kanban-board/styles.css',
  './apps/kanban-board/app.js',
  './apps/kanban-board/icon.svg',

  './apps/todo-list/manifest.json',
  './apps/todo-list/index.html',
  './apps/todo-list/styles.css',
  './apps/todo-list/app.js',
  './apps/todo-list/icon.svg',

  './apps/notes/manifest.json',
  './apps/notes/index.html',
  './apps/notes/styles.css',
  './apps/notes/app.js',
  './apps/notes/icon.svg',

  './apps/habits/manifest.json',
  './apps/habits/index.html',
  './apps/habits/styles.css',
  './apps/habits/app.js',
  './apps/habits/icon.svg',

  './apps/mirror/manifest.json',
  './apps/mirror/index.html',
  './apps/mirror/styles.css',
  './apps/mirror/app.js',
  './apps/mirror/icon.svg',

  './apps/weight-tracker/manifest.json',
  './apps/weight-tracker/index.html',
  './apps/weight-tracker/styles.css',
  './apps/weight-tracker/app.js',
  './apps/weight-tracker/icon.svg',

  './apps/timer/manifest.json',
  './apps/timer/index.html',
  './apps/timer/styles.css',
  './apps/timer/app.js',
  './apps/timer/icon.svg',

  './apps/soundscape/manifest.json',
  './apps/soundscape/index.html',
  './apps/soundscape/styles.css',
  './apps/soundscape/app.js',
  './apps/soundscape/icon.svg'
  // AUTO:APP-CACHE-END
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Always fetch version.json from network — never serve from cache
  if (event.request.url.endsWith('/version.json')) {
    event.respondWith(fetch(event.request));
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

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        }).catch(() => {
          return caches.match('./index.html');
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
