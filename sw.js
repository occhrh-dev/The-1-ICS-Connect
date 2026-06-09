// Service Worker for EOC Rayong War Room
const CACHE_NAME = 'eoc-warroom-v20260609_0820';

// à¹„à¸Ÿà¸¥à¹Œà¸—à¸µà¹ˆ cache à¹„à¸§à¹‰à¸•à¸­à¸™ install
const STATIC_ASSETS = [
  'https://occhrh-dev.github.io/The-1-ICS-script/script2.js?v=20260609_0820',
  'https://occhrh-dev.github.io/The-1-ICS-script/script3.js?v=20260609_0820',
  'https://occhrh-dev.github.io/HazMat-Mapper/the1ICS.png'
];

// Install â€” cache static assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate â€” à¸¥à¸š cache à¹€à¸à¹ˆà¸²
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

// Fetch â€” Network first, fallback to cache
self.addEventListener('fetch', function(event) {
  // à¹„à¸¡à¹ˆ cache GAS requests (google.script.run à¹ƒà¸Šà¹‰ channel à¸‚à¸­à¸‡à¸•à¸±à¸§à¹€à¸­à¸‡)
  if (event.request.url.includes('script.google.com') ||
      event.request.url.includes('googleapis.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        // Cache response à¹ƒà¸«à¸¡à¹ˆà¸ˆà¸²à¸ GitHub Pages
        if (response.ok && event.request.url.includes('github.io')) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(function() {
        // à¸–à¹‰à¸² network à¹„à¸¡à¹ˆà¹„à¸”à¹‰ à¹ƒà¸Šà¹‰ cache
        return caches.match(event.request);
      })
  );
});
