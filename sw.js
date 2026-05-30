// Service Worker for EOC Rayong War Room
const CACHE_NAME = 'eoc-warroom-v1';

// ไฟล์ที่ cache ไว้ตอน install
const STATIC_ASSETS = [
  'https://occhrh-dev.github.io/The-1-ICS-script/script2.js',
  'https://occhrh-dev.github.io/The-1-ICS-script/script3.js',
  'https://occhrh-dev.github.io/HazMat-Mapper/the1ICS.png'
];

// Install — cache static assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate — ลบ cache เก่า
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

// Fetch — Network first, fallback to cache
self.addEventListener('fetch', function(event) {
  // ไม่ cache GAS requests (google.script.run ใช้ channel ของตัวเอง)
  if (event.request.url.includes('script.google.com') ||
      event.request.url.includes('googleapis.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        // Cache response ใหม่จาก GitHub Pages
        if (response.ok && event.request.url.includes('github.io')) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(function() {
        // ถ้า network ไม่ได้ ใช้ cache
        return caches.match(event.request);
      })
  );
});
