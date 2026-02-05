// Service Worker for offline support - MarlApps v2.0

const CACHE_NAME = 'marlapps-v17';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',

  // Theme system
  './themes/tokens.css',
  './themes/dark.css',
  './themes/light.css',
  './themes/app-common.css',

  // Launcher
  './launcher/launcher.css',
  './launcher/theme-manager.js',
  './launcher/app-loader.js',
  './launcher/search.js',
  './launcher/settings.js',
  './launcher/launcher.js',
  './launcher/pwa-install.js',

  // App Registry
  './registry/apps.json',

  // Pomodoro Timer App
  './apps/pomodoro-timer/manifest.json',
  './apps/pomodoro-timer/index.html',
  './apps/pomodoro-timer/styles.css',
  './apps/pomodoro-timer/app.js',
  './apps/pomodoro-timer/icon.svg',

  // Kanban Board App
  './apps/kanban-board/manifest.json',
  './apps/kanban-board/index.html',
  './apps/kanban-board/styles.css',
  './apps/kanban-board/app.js',
  './apps/kanban-board/icon.svg',

  // Todo List App
  './apps/todo-list/manifest.json',
  './apps/todo-list/index.html',
  './apps/todo-list/styles.css',
  './apps/todo-list/app.js',
  './apps/todo-list/icon.svg',

  // Notes App
  './apps/notes/manifest.json',
  './apps/notes/index.html',
  './apps/notes/styles.css',
  './apps/notes/app.js',
  './apps/notes/icon.svg',

  // Habits App
  './apps/habits/manifest.json',
  './apps/habits/index.html',
  './apps/habits/styles.css',
  './apps/habits/app.js',
  './apps/habits/icon.svg',

  // Mirror App
  './apps/mirror/manifest.json',
  './apps/mirror/index.html',
  './apps/mirror/styles.css',
  './apps/mirror/app.js',
  './apps/mirror/icon.svg'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('MarlApps: Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.log('MarlApps: Cache installation failed:', error);
      })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('MarlApps: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then((response) => {
          // Check if we received a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        }).catch((error) => {
          console.log('MarlApps: Fetch failed, returning cached index:', error);
          // Return the main app for navigation requests
          return caches.match('./index.html');
        });
      })
  );
});

// Message event - handle skip waiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
