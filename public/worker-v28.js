const CACHE_NAME = 'la-libelula-v22';
const ASSETS = [
    '/',
    '/index.html',
    '/libelula.webmanifest',
    '/pwa-v21-192.png',
    '/pwa-v21-256.png',
    '/pwa-v21-512.png',
    '/pwa-v21-maskable.png',
    '/screenshot-desktop.png',
    '/screenshot-mobile.png',
    '/favicon.ico',
    '/favicon.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
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
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
