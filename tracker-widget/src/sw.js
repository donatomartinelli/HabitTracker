// --- src/sw.js ---
// Service Worker Offline-First per Cortex PWA
// Mette in cache tutti i file dell'interfaccia e li aggiorna in background quando c'è rete

const CACHE_NAME = 'cortex-os-cache-v2';

const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './css/base.css',
    './css/layout.css',
    './css/components.css',
    './css/features.css',
    './js/core/state.js',
    './js/core/cloud-sync.js',
    './js/core/workspace.js',
    './js/core/dsl.js',
    './js/core/mobile-touch.js',
    './js/modules/calendar.js',
    './js/modules/tasks.js',
    './js/modules/notes.js',
    './js/modules/planner.js',
    './js/modules/diet.js',
    './js/modules/gym.js',
    './js/modules/money.js',
    './js/modules/uni.js',
    './js/modules/modals.js',
    './js/ai/gemini-agent.js',
    './js/ai/terminal-ui.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.allSettled(
                CORE_ASSETS.map((url) => cache.add(url))
            );
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.map((k) => {
                    if (k !== CACHE_NAME) return caches.delete(k);
                })
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Non mettere mai in cache le chiamate API a GitHub Gist o Gemini
    if (url.hostname.includes('api.github.com') ||
        url.hostname.includes('githubusercontent.com') ||
        url.hostname.includes('googleapis.com')) {
        return;
    }

    // Strategia Network-First con Fallback immediato su Cache quando sei Offline
    event.respondWith(
        fetch(req)
            .then((networkResp) => {
                if (networkResp && networkResp.status === 200) {
                    const respClone = networkResp.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone));
                }
                return networkResp;
            })
            .catch(() => {
                return caches.match(req).then((cachedResp) => {
                    if (cachedResp) return cachedResp;
                    if (req.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });
            })
    );
});