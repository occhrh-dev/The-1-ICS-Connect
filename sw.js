// Service Worker for EOC Rayong War Room
const CACHE_NAME = 'eoc-warroom-v20261005_tambon1';

const STATIC_ASSETS = [
  'https://occhrh-dev.github.io/The-1-ICS-Connect/script2.js?v=20261005_gistda1',
  'https://occhrh-dev.github.io/The-1-ICS-Connect/script3.js?v=20261005_tambon1',
  'https://occhrh-dev.github.io/The-1-ICS-Connect/dashboard-layout.css?v=20261005_gistda1',
  'https://occhrh-dev.github.io/The-1-ICS-Connect/dashboard-map-modes.js?v=20261005_gistda1',
  'https://occhrh-dev.github.io/The-1-ICS-Connect/gistda-provinces.js?v=20261005_gistda2',
  'https://occhrh-dev.github.io/The-1-ICS-Connect/dashboard-gistda-flood.js?v=20261005_gistda2',
  'https://occhrh-dev.github.io/The-1-ICS-Connect/flood-incident-settings.js?v=20261005_gistda1',
  'https://occhrh-dev.github.io/The-1-ICS-Connect/stylesheet.css?v=20261002_layout1',
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
  // Live/provider requests must never be frozen in the app's cache-first store.
  if (new URL(event.request.url).hostname === 'msv.longdo.com') return;
  if (new URL(event.request.url).hostname === 'the-1-ics-gistda-flood.occ-hrh.workers.dev') return;

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
