self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// A simple fetch handler to make it a valid PWA
self.addEventListener('fetch', (event) => {
  // We don't cache anything for now, just pass through
});
