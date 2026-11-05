const CACHE_NAME = 'wizchat-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});self.addEventListener('fetch', (e) => {
    const url = e.request.url;
    if (url.includes('firebase') || url.includes('imgbb') ||
        url.includes('googleapis') || url.includes('gstatic') ||
        url.includes('telegram.org') || url.includes('flaticon')) {
        return;
    }
    e.respondWith(
        caches.match(e.request).then(cached => {
            return cached || fetch(e.request).then(res => {
                return caches.open(CACHE_NAME).then(c => {
                    c.put(e.request, res.clone());
                    return res;
                });
            }).catch(() => caches.match('./index.html'));
        })
    );
});