// Service Worker for EOC Rayong War Room
const CACHE_NAME = 'eoc-warroom-v20260609_1325';

const STATIC_ASSETS = [
  'https://occhrh-dev.github.io/The-1-ICS-script/script2.js?v=20260609_1325',
  'https://occhrh-dev.github.io/The-1-ICS-script/script3.js?v=20260609_1325',
  'https://occhrh-dev.github.io/HazMat-Mapper/the1ICS.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
          .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        var copy = response.clone();
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, copy);
          });
        }
        return response;
      });
    })
  );
});
